// Lokale Sprachmodell-Engine des KI-Buddys (llama.cpp).
//
// Bewusst schmal gehalten: Die Engine kennt weder Chat-Formate noch Tools.
// Prompt-Aufbau, Qwen-Chat-Template und Tool-Calling leben im Web-Teil
// (src/lib/localLlm/), damit sie ohne neue APK aktualisiert werden koennen.
// Hier passiert nur, was nativ sein muss: Modell laden, Prompt verarbeiten,
// Token samplen, den Zustand zwischen Anfragen wiederverwenden.

#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <vector>

struct llama_model;
struct llama_context;

namespace bbllm {

struct LoadParams {
    std::string model_path;
    int n_ctx = 4096;
    int n_threads = 4;
};

struct GenerateParams {
    // Stabiler Anfang des Prompts (System-Prompt inkl. Tool-Beschreibungen).
    // Bei Modellen mit rekurrentem Zustand (Qwen3.5 = Hybrid aus Gated DeltaNet
    // und Attention) laesst sich der Speicher nicht teilweise zuruecksetzen;
    // deshalb sichert die Engine den Zustand am Ende dieses Abschnitts
    // (Checkpoint) und muss ihn bei der naechsten Frage nicht neu berechnen.
    std::string prefix;
    // Variabler Rest (Verlauf, aktuelle Frage, Tool-Ergebnisse).
    std::string suffix;
    // 0 = nur Prompt verarbeiten (Vorwaermen), nichts erzeugen.
    int max_tokens = 512;
    float temperature = 0.7f;
    float top_p = 0.8f;
    int top_k = 20;
    float min_p = 0.0f;
    float repeat_penalty = 1.05f;
    // Optional: Datei fuer den Prefix-Checkpoint. Ueberlebt App-Neustarts, so
    // dass der feste Prompt-Teil nicht bei jedem Modellstart neu gerechnet
    // werden muss (auf Handy-CPUs 30-60 s). Der Aufrufer waehlt den Pfad pro
    // Modell und Prefix.
    std::string checkpoint_path;
    // Erzeugung endet vor dem ersten Auftreten eines dieser Texte.
    std::vector<std::string> stop;
};

struct GenerateStats {
    int prompt_tokens = 0;
    int reused_tokens = 0;
    int generated_tokens = 0;
    double prompt_ms = 0;
    double generate_ms = 0;
    std::string stop_reason;  // eos | stop | length | cancelled | prime
};

// Liefert false, um die Erzeugung abzubrechen.
using PieceCallback = std::function<bool(const std::string &)>;

class Engine {
public:
    Engine() = default;
    ~Engine();
    Engine(const Engine &) = delete;
    Engine & operator=(const Engine &) = delete;

    // Einmal pro Prozess. lib_dir = Verzeichnis der CPU-Backend-Varianten
    // (libggml-cpu-*.so); leer = eingebautes Backend.
    static void init_backends(const std::string & lib_dir);

    bool load(const LoadParams & params, std::string & error);
    void unload();
    bool is_loaded();

    bool generate(const GenerateParams & params, const PieceCallback & on_piece,
                  GenerateStats & stats, std::string & error);

    // Thread-sicher; bricht auch eine laufende Prompt-Verarbeitung ab.
    void cancel();

    std::string describe();

private:
    bool tokenize(const std::string & text, std::vector<int32_t> & out);
    bool decode_range(const std::vector<int32_t> & tokens, size_t from, size_t to, bool logits_last);
    bool prepare_prompt(const std::vector<int32_t> & tokens, size_t prefix_len, bool need_logits,
                        const std::string & checkpoint_path, GenerateStats & stats, std::string & error);
    void reset_state();
    void save_checkpoint(size_t n_tokens, const std::string & path);
    bool restore_checkpoint();
    void load_checkpoint_file(const std::string & path);
    static bool abort_callback(void * data);

    std::mutex mutex_;
    std::atomic<bool> cancel_{false};

    llama_model * model_ = nullptr;
    llama_context * ctx_ = nullptr;
    int n_ctx_ = 0;
    int n_batch_ = 512;
    bool stateful_memory_ = false;  // rekurrent/hybrid: kein Teil-Zuruecksetzen

    // Token, deren Zustand gerade im Speicher des Kontexts liegt.
    std::vector<int32_t> cached_;
    // Checkpoint am Ende des Prefix (nur bei rekurrentem Zustand).
    std::vector<int32_t> checkpoint_tokens_;
    std::vector<uint8_t> checkpoint_data_;
};

}  // namespace bbllm
