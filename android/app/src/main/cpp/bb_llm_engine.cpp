#include "bb_llm_engine.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>

#include "ggml-backend.h"
#include "llama.h"

namespace bbllm {

namespace {

using Clock = std::chrono::steady_clock;

double ms_since(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

// Laenge des laengsten gueltigen UTF-8-Anfangs. Ein Token kann mitten in
// einem Mehrbyte-Zeichen enden (Umlaute, Emoji); unvollstaendige Bytes
// bleiben bis zum naechsten Token zurueck.
size_t valid_utf8_prefix(const std::string & s) {
    size_t i = 0;
    const size_t n = s.size();
    while (i < n) {
        const auto c = static_cast<unsigned char>(s[i]);
        size_t len;
        if (c < 0x80) len = 1;
        else if ((c & 0xE0) == 0xC0) len = 2;
        else if ((c & 0xF0) == 0xE0) len = 3;
        else if ((c & 0xF8) == 0xF0) len = 4;
        else { i += 1; continue; }  // ungueltiges Byte: weiterreichen statt blockieren
        if (i + len > n) break;
        bool ok = true;
        for (size_t k = 1; k < len; ++k) {
            if ((static_cast<unsigned char>(s[i + k]) & 0xC0) != 0x80) { ok = false; break; }
        }
        i += ok ? len : 1;
    }
    return i;
}

std::string token_to_piece(const llama_vocab * vocab, llama_token token) {
    char buf[256];
    int n = llama_token_to_piece(vocab, token, buf, sizeof(buf), 0, false);
    if (n >= 0) return std::string(buf, n);
    std::string big(static_cast<size_t>(-n), '\0');
    n = llama_token_to_piece(vocab, token, big.data(), static_cast<int32_t>(big.size()), 0, false);
    return n >= 0 ? big.substr(0, static_cast<size_t>(n)) : std::string();
}

}  // namespace

Engine::~Engine() { unload(); }

void Engine::init_backends(const std::string & lib_dir) {
    static std::once_flag once;
    std::call_once(once, [&lib_dir] {
        if (!lib_dir.empty()) {
            ggml_backend_load_all_from_path(lib_dir.c_str());
        } else {
            ggml_backend_load_all();
        }
        llama_backend_init();
    });
}

bool Engine::abort_callback(void * data) {
    return static_cast<Engine *>(data)->cancel_.load();
}

bool Engine::load(const LoadParams & params, std::string & error) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (ctx_) {
        llama_free(ctx_);
        ctx_ = nullptr;
    }
    if (model_) {
        llama_model_free(model_);
        model_ = nullptr;
    }
    reset_state();

    llama_model_params mparams = llama_model_default_params();
    // Modell aus der Datei einblenden statt in den Heap kopieren: Android kann
    // die Seiten bei Speicherdruck verwerfen und spaeter neu lesen.
    mparams.load_mode = LLAMA_LOAD_MODE_MMAP;
    model_ = llama_model_load_from_file(params.model_path.c_str(), mparams);
    if (!model_) {
        error = "model_load_failed";
        return false;
    }

    const int trained = llama_model_n_ctx_train(model_);
    n_ctx_ = std::max(512, trained > 0 ? std::min(params.n_ctx, trained) : params.n_ctx);
    n_batch_ = std::min(512, n_ctx_);

    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx = static_cast<uint32_t>(n_ctx_);
    cparams.n_batch = static_cast<uint32_t>(n_batch_);
    cparams.n_ubatch = static_cast<uint32_t>(n_batch_);
    cparams.n_seq_max = 1;
    cparams.n_threads = params.n_threads;
    cparams.n_threads_batch = params.n_threads;
    cparams.no_perf = true;
    ctx_ = llama_init_from_model(model_, cparams);
    if (!ctx_) {
        llama_model_free(model_);
        model_ = nullptr;
        error = "context_init_failed";
        return false;
    }
    llama_set_abort_callback(ctx_, &Engine::abort_callback, this);
    stateful_memory_ = llama_model_is_recurrent(model_) || llama_model_is_hybrid(model_);
    return true;
}

void Engine::unload() {
    cancel_.store(true);
    std::lock_guard<std::mutex> lock(mutex_);
    if (ctx_) {
        llama_free(ctx_);
        ctx_ = nullptr;
    }
    if (model_) {
        llama_model_free(model_);
        model_ = nullptr;
    }
    reset_state();
    cancel_.store(false);
}

bool Engine::is_loaded() {
    std::lock_guard<std::mutex> lock(mutex_);
    return ctx_ != nullptr;
}

void Engine::cancel() { cancel_.store(true); }

void Engine::reset_state() {
    cached_.clear();
    checkpoint_tokens_.clear();
    checkpoint_data_.clear();
    checkpoint_data_.shrink_to_fit();
}

bool Engine::tokenize(const std::string & text, std::vector<int32_t> & out) {
    out.clear();
    if (text.empty()) return true;
    const llama_vocab * vocab = llama_model_get_vocab(model_);
    // parse_special=true: Die Chat-Marker (<|im_start|>, <|im_end|>) kommen als
    // Text aus dem Web-Teil und muessen zu ihren Spezial-Token werden.
    int n = llama_tokenize(vocab, text.c_str(), static_cast<int32_t>(text.size()), nullptr, 0, false, true);
    if (n == INT32_MIN) return false;
    n = n < 0 ? -n : n;
    out.resize(static_cast<size_t>(n));
    const int got = llama_tokenize(vocab, text.c_str(), static_cast<int32_t>(text.size()), out.data(), n, false, true);
    if (got < 0) return false;
    out.resize(static_cast<size_t>(got));
    return true;
}

bool Engine::decode_range(const std::vector<int32_t> & tokens, size_t from, size_t to, bool logits_last) {
    llama_batch batch = llama_batch_init(n_batch_, 0, 1);
    bool ok = true;
    for (size_t start = from; start < to && ok; start += static_cast<size_t>(n_batch_)) {
        const size_t end = std::min(to, start + static_cast<size_t>(n_batch_));
        batch.n_tokens = 0;
        for (size_t i = start; i < end; ++i) {
            const int k = batch.n_tokens++;
            batch.token[k] = tokens[i];
            batch.pos[k] = static_cast<llama_pos>(i);
            batch.n_seq_id[k] = 1;
            batch.seq_id[k][0] = 0;
            batch.logits[k] = (logits_last && i + 1 == to) ? 1 : 0;
        }
        if (llama_decode(ctx_, batch) != 0) {
            ok = false;
            break;
        }
        cached_.insert(cached_.end(), tokens.begin() + static_cast<long>(start), tokens.begin() + static_cast<long>(end));
    }
    llama_batch_free(batch);
    return ok;
}

namespace {

// Kopf der Checkpoint-Datei. Der llama.cpp-Tag steht mit drin: Das Format des
// Zustands kann sich zwischen Versionen aendern, eine alte Datei wird dann
// verworfen statt falsch eingelesen.
constexpr uint32_t kCheckpointMagic = 0x4B434242;  // "BBCK"
constexpr uint32_t kCheckpointVersion = 1;
constexpr size_t kMinPersistTokens = 256;
#ifndef BB_LLAMA_TAG
#define BB_LLAMA_TAG "dev"
#endif

bool write_all(FILE * f, const void * data, size_t size) {
    return size == 0 || fwrite(data, 1, size, f) == size;
}

bool read_all(FILE * f, void * data, size_t size) {
    return size == 0 || fread(data, 1, size, f) == size;
}

}  // namespace

void Engine::load_checkpoint_file(const std::string & path) {
    FILE * f = fopen(path.c_str(), "rb");
    if (!f) return;
    uint32_t magic = 0, version = 0, tag_len = 0;
    uint64_t n_tokens = 0, n_bytes = 0;
    std::string tag;
    std::vector<int32_t> tokens;
    std::vector<uint8_t> data;
    bool ok = read_all(f, &magic, sizeof(magic)) && read_all(f, &version, sizeof(version)) &&
              magic == kCheckpointMagic && version == kCheckpointVersion &&
              read_all(f, &tag_len, sizeof(tag_len)) && tag_len < 64;
    if (ok) {
        tag.resize(tag_len);
        ok = read_all(f, tag.data(), tag_len) && tag == BB_LLAMA_TAG &&
             read_all(f, &n_tokens, sizeof(n_tokens)) && n_tokens > 0 &&
             n_tokens <= static_cast<uint64_t>(n_ctx_);
    }
    if (ok) {
        tokens.resize(static_cast<size_t>(n_tokens));
        ok = read_all(f, tokens.data(), tokens.size() * sizeof(int32_t)) &&
             read_all(f, &n_bytes, sizeof(n_bytes)) && n_bytes > 0 && n_bytes < (1ULL << 32);
    }
    if (ok) {
        data.resize(static_cast<size_t>(n_bytes));
        ok = read_all(f, data.data(), data.size());
    }
    fclose(f);
    if (!ok) {
        remove(path.c_str());
        return;
    }
    checkpoint_tokens_ = std::move(tokens);
    checkpoint_data_ = std::move(data);
}

void Engine::save_checkpoint(size_t n_tokens, const std::string & path) {
    const size_t size = llama_state_seq_get_size(ctx_, 0);
    if (size == 0) return;
    checkpoint_data_.resize(size);
    const size_t written = llama_state_seq_get_data(ctx_, checkpoint_data_.data(), size, 0);
    if (written == 0) {
        checkpoint_tokens_.clear();
        checkpoint_data_.clear();
        return;
    }
    checkpoint_data_.resize(written);
    checkpoint_tokens_.assign(cached_.begin(), cached_.begin() + static_cast<long>(n_tokens));

    // Kurze Prefixe sind schneller neu gerechnet als gelesen: Der rekurrente
    // Zustand von Qwen3.5 allein belegt schon zig MB.
    if (path.empty() || n_tokens < kMinPersistTokens) return;
    // Erst in eine temporaere Datei, dann umbenennen: Ein Abbruch mitten im
    // Schreiben hinterlaesst so nie eine halbe Datei unter dem echten Namen.
    const std::string tmp = path + ".tmp";
    FILE * f = fopen(tmp.c_str(), "wb");
    if (!f) return;
    const uint32_t tag_len = static_cast<uint32_t>(strlen(BB_LLAMA_TAG));
    const uint64_t n_tok = checkpoint_tokens_.size();
    const uint64_t n_bytes = checkpoint_data_.size();
    const bool ok = write_all(f, &kCheckpointMagic, sizeof(kCheckpointMagic)) &&
                    write_all(f, &kCheckpointVersion, sizeof(kCheckpointVersion)) &&
                    write_all(f, &tag_len, sizeof(tag_len)) && write_all(f, BB_LLAMA_TAG, tag_len) &&
                    write_all(f, &n_tok, sizeof(n_tok)) &&
                    write_all(f, checkpoint_tokens_.data(), checkpoint_tokens_.size() * sizeof(int32_t)) &&
                    write_all(f, &n_bytes, sizeof(n_bytes)) &&
                    write_all(f, checkpoint_data_.data(), checkpoint_data_.size());
    const bool closed = fclose(f) == 0;
    if (ok && closed) {
        rename(tmp.c_str(), path.c_str());
    } else {
        remove(tmp.c_str());
    }
}

bool Engine::restore_checkpoint() {
    llama_memory_clear(llama_get_memory(ctx_), true);
    cached_.clear();
    if (checkpoint_data_.empty()) return false;
    if (llama_state_seq_set_data(ctx_, checkpoint_data_.data(), checkpoint_data_.size(), 0) == 0) {
        llama_memory_clear(llama_get_memory(ctx_), true);
        checkpoint_tokens_.clear();
        checkpoint_data_.clear();
        return false;
    }
    cached_ = checkpoint_tokens_;
    return true;
}

// Bringt den Kontext auf den Stand `tokens` und berechnet dabei nur, was sich
// gegenueber der letzten Anfrage geaendert hat.
bool Engine::prepare_prompt(const std::vector<int32_t> & tokens, size_t prefix_len, bool need_logits,
                            const std::string & checkpoint_path, GenerateStats & stats, std::string & error) {
    llama_memory_t mem = llama_get_memory(ctx_);

    auto checkpoint_fits = [&](size_t limit) {
        const size_t n = checkpoint_tokens_.size();
        return n > 0 && n <= limit && n <= tokens.size() &&
               std::equal(checkpoint_tokens_.begin(), checkpoint_tokens_.end(), tokens.begin());
    };
    // Nach einem Neustart liegt der Checkpoint nur auf dem Speicher des Geraets.
    if (stateful_memory_ && !checkpoint_path.empty() && prefix_len > 0 &&
        !(checkpoint_tokens_.size() == prefix_len && checkpoint_fits(prefix_len))) {
        load_checkpoint_file(checkpoint_path);
    }

    size_t common = 0;
    while (common < cached_.size() && common < tokens.size() && cached_[common] == tokens[common]) ++common;
    // Mindestens das letzte Token muss neu berechnet werden, sonst fehlen die
    // Logits fuer das erste erzeugte Token.
    size_t keep = std::min(common, tokens.size() - 1);

    if (keep < cached_.size()) {
        if (llama_memory_seq_rm(mem, 0, static_cast<llama_pos>(keep), -1)) {
            cached_.resize(keep);
        } else {
            // Rekurrenter Zustand laesst sich nicht teilweise zuruecksetzen:
            // auf den Checkpoint zurueckspringen, falls er zum neuen Prompt passt.
            if (checkpoint_fits(keep) && restore_checkpoint()) {
                keep = checkpoint_tokens_.size();
            } else {
                llama_memory_clear(mem, true);
                cached_.clear();
                keep = 0;
            }
        }
    }
    // Checkpoint reicht weiter als der wiederverwendbare Speicherstand (etwa
    // frisch von der Platte geladen): zurueckspielen statt neu rechnen.
    // Fuer eine Erzeugung muss danach noch mindestens ein Token gerechnet werden.
    if (checkpoint_tokens_.size() > keep &&
        checkpoint_fits(need_logits ? tokens.size() - 1 : tokens.size()) && restore_checkpoint()) {
        keep = checkpoint_tokens_.size();
    }
    stats.reused_tokens = static_cast<int>(keep);

    // Checkpoint am Prefix-Ende anlegen, falls noch keiner zu diesem Prefix
    // passt. Der Zustand steht dort genau dann, wenn bis prefix_len gerechnet ist.
    const bool checkpoint_matches = checkpoint_tokens_.size() == prefix_len &&
                                    std::equal(checkpoint_tokens_.begin(), checkpoint_tokens_.end(), tokens.begin());
    if (stateful_memory_ && prefix_len > 0 && prefix_len >= keep && prefix_len <= tokens.size() &&
        !checkpoint_matches) {
        if (prefix_len > keep && !decode_range(tokens, keep, prefix_len, prefix_len == tokens.size())) {
            error = cancel_.load() ? "cancelled" : "decode_failed";
            return false;
        }
        save_checkpoint(prefix_len, checkpoint_path);
        keep = prefix_len;
    }
    if (keep < tokens.size() && !decode_range(tokens, keep, tokens.size(), true)) {
        error = cancel_.load() ? "cancelled" : "decode_failed";
        return false;
    }
    return true;
}

bool Engine::generate(const GenerateParams & params, const PieceCallback & on_piece, GenerateStats & stats,
                      std::string & error) {
    std::lock_guard<std::mutex> lock(mutex_);
    cancel_.store(false);
    if (!ctx_) {
        error = "not_loaded";
        return false;
    }

    std::vector<int32_t> prefix_tokens;
    std::vector<int32_t> suffix_tokens;
    if (!tokenize(params.prefix, prefix_tokens) || !tokenize(params.suffix, suffix_tokens)) {
        error = "tokenize_failed";
        return false;
    }
    std::vector<int32_t> tokens = prefix_tokens;
    tokens.insert(tokens.end(), suffix_tokens.begin(), suffix_tokens.end());
    if (tokens.empty()) {
        error = "empty_prompt";
        return false;
    }
    const int max_tokens = std::max(0, params.max_tokens);
    stats.prompt_tokens = static_cast<int>(tokens.size());
    if (static_cast<int>(tokens.size()) + max_tokens > n_ctx_) {
        error = "context_overflow";
        return false;
    }

    // Vorwaermen (max_tokens == 0) mit einem Prompt, der schon im Speicher
    // liegt: nichts zu tun. Ohne diese Abkuerzung muesste bei rekurrentem
    // Zustand alles neu gerechnet werden.
    if (max_tokens == 0 && cached_.size() >= tokens.size() &&
        std::equal(tokens.begin(), tokens.end(), cached_.begin())) {
        stats.reused_tokens = static_cast<int>(tokens.size());
        stats.stop_reason = "prime";
        return true;
    }

    const auto t_prompt = Clock::now();
    if (!prepare_prompt(tokens, prefix_tokens.size(), max_tokens > 0, params.checkpoint_path, stats, error)) {
        // Unklarer Zwischenstand nach Abbruch/Fehler: sauber neu beginnen.
        llama_memory_clear(llama_get_memory(ctx_), true);
        cached_.clear();
        if (error == "cancelled") stats.stop_reason = "cancelled";
        return false;
    }
    stats.prompt_ms = ms_since(t_prompt);

    if (max_tokens == 0) {
        stats.stop_reason = "prime";
        return true;
    }

    const llama_vocab * vocab = llama_model_get_vocab(model_);
    llama_sampler_chain_params sp = llama_sampler_chain_default_params();
    sp.no_perf = true;
    llama_sampler * sampler = llama_sampler_chain_init(sp);
    if (params.repeat_penalty > 1.0f) {
        llama_sampler_chain_add(sampler, llama_sampler_init_penalties(llama_vocab_n_tokens(vocab), 64, params.repeat_penalty, 0.0f, 0.0f));
    }
    if (params.temperature <= 0.0f) {
        llama_sampler_chain_add(sampler, llama_sampler_init_greedy());
    } else {
        if (params.top_k > 0) llama_sampler_chain_add(sampler, llama_sampler_init_top_k(params.top_k));
        if (params.top_p > 0.0f && params.top_p < 1.0f) llama_sampler_chain_add(sampler, llama_sampler_init_top_p(params.top_p, 1));
        if (params.min_p > 0.0f) llama_sampler_chain_add(sampler, llama_sampler_init_min_p(params.min_p, 1));
        llama_sampler_chain_add(sampler, llama_sampler_init_temp(params.temperature));
        llama_sampler_chain_add(sampler, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
    }

    size_t max_stop = 0;
    for (const auto & s : params.stop) max_stop = std::max(max_stop, s.size());

    std::string pending_bytes;  // unvollstaendiges UTF-8
    std::string held;           // zurueckgehaltener Text (moeglicher Stop-Anfang)
    std::string reason = "length";
    const auto t_gen = Clock::now();
    bool ok = true;

    for (int i = 0; i < max_tokens; ++i) {
        if (cancel_.load()) { reason = "cancelled"; break; }
        const llama_token tok = llama_sampler_sample(sampler, ctx_, -1);
        if (llama_vocab_is_eog(vocab, tok)) { reason = "eos"; break; }
        stats.generated_tokens++;

        pending_bytes += token_to_piece(vocab, tok);
        const size_t valid = valid_utf8_prefix(pending_bytes);
        held += pending_bytes.substr(0, valid);
        pending_bytes.erase(0, valid);

        size_t stop_at = std::string::npos;
        for (const auto & s : params.stop) {
            if (s.empty()) continue;
            const size_t p = held.find(s);
            if (p != std::string::npos) stop_at = std::min(stop_at, p);
        }
        if (stop_at != std::string::npos) {
            held.resize(stop_at);
            if (!held.empty() && !on_piece(held)) { reason = "cancelled"; held.clear(); break; }
            held.clear();
            reason = "stop";
            break;
        }
        // Alles ausser den letzten (max_stop - 1) Bytes ist sicher kein
        // Stop-Anfang mehr und darf raus. Schnitt nur an Zeichengrenzen.
        if (held.size() >= max_stop) {
            size_t emit = held.size() - (max_stop > 0 ? max_stop - 1 : 0);
            while (emit > 0 && emit < held.size() && (static_cast<unsigned char>(held[emit]) & 0xC0) == 0x80) --emit;
            if (emit > 0) {
                if (!on_piece(held.substr(0, emit))) { reason = "cancelled"; held.clear(); break; }
                held.erase(0, emit);
            }
        }

        if (i + 1 == max_tokens) break;  // letztes Token: keine weiteren Logits noetig
        llama_batch batch = llama_batch_get_one(const_cast<llama_token *>(&tok), 1);
        if (llama_decode(ctx_, batch) != 0) {
            if (cancel_.load()) {
                reason = "cancelled";
            } else {
                error = "decode_failed";
                ok = false;
            }
            llama_memory_clear(llama_get_memory(ctx_), true);
            cached_.clear();
            held.clear();
            break;
        }
        cached_.push_back(tok);
    }
    if (!held.empty() && reason != "cancelled") on_piece(held);

    llama_sampler_free(sampler);
    stats.generate_ms = ms_since(t_gen);
    stats.stop_reason = reason;
    return ok;
}

std::string Engine::describe() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string out = llama_print_system_info();
    if (model_) {
        char desc[256];
        llama_model_desc(model_, desc, sizeof(desc));
        out = std::string(desc) + " | ctx " + std::to_string(n_ctx_) + " | " + out;
    }
    return out;
}

}  // namespace bbllm
