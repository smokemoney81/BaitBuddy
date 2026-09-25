// JNI-Bruecke zu app.baitbuddy.mobile.llm.LlamaNative.
//
// Texte gehen als UTF-8-Bytes ueber die Grenze statt als jstring:
// NewStringUTF erwartet "modified UTF-8" und bricht bei Zeichen ausserhalb der
// BMP (Emoji in Nutzereingaben oder Modellausgaben) ab.

#include <jni.h>

#include <string>
#include <vector>

#include "bb_llm_engine.h"
#include "llama.h"

#ifdef __ANDROID__
#include <android/log.h>
#endif

namespace {

bbllm::Engine & engine() {
    static bbllm::Engine instance;
    return instance;
}

std::string bytes_to_string(JNIEnv * env, jbyteArray arr) {
    if (!arr) return {};
    const jsize len = env->GetArrayLength(arr);
    std::string out(static_cast<size_t>(len), '\0');
    if (len > 0) env->GetByteArrayRegion(arr, 0, len, reinterpret_cast<jbyte *>(out.data()));
    return out;
}

jbyteArray string_to_bytes(JNIEnv * env, const std::string & s) {
    jbyteArray arr = env->NewByteArray(static_cast<jsize>(s.size()));
    if (arr && !s.empty()) {
        env->SetByteArrayRegion(arr, 0, static_cast<jsize>(s.size()), reinterpret_cast<const jbyte *>(s.data()));
    }
    return arr;
}

std::string jstring_to_string(JNIEnv * env, jstring s) {
    if (!s) return {};
    const char * chars = env->GetStringUTFChars(s, nullptr);
    std::string out(chars ? chars : "");
    if (chars) env->ReleaseStringUTFChars(s, chars);
    return out;
}

std::string json_escape(const std::string & s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (const char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    return out;
}

void log_callback(ggml_log_level level, const char * text, void *) {
#ifdef __ANDROID__
    if (level >= GGML_LOG_LEVEL_WARN) {
        __android_log_print(level >= GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR : ANDROID_LOG_WARN, "BaitBuddyLLM", "%s", text);
    }
#else
    (void) level;
    (void) text;
#endif
}

}  // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_app_baitbuddy_mobile_llm_LlamaNative_nativeIsSupported(JNIEnv *, jclass) {
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_app_baitbuddy_mobile_llm_LlamaNative_nativeInit(JNIEnv * env, jclass, jstring lib_dir) {
    llama_log_set(log_callback, nullptr);
    bbllm::Engine::init_backends(jstring_to_string(env, lib_dir));
}

JNIEXPORT jstring JNICALL
Java_app_baitbuddy_mobile_llm_LlamaNative_nativeLoad(JNIEnv * env, jclass, jstring path, jint n_ctx, jint n_threads) {
    bbllm::LoadParams params;
    params.model_path = jstring_to_string(env, path);
    params.n_ctx = n_ctx;
    params.n_threads = n_threads;
    std::string error;
    if (engine().load(params, error)) return nullptr;
    return env->NewStringUTF(error.c_str());
}

JNIEXPORT void JNICALL
Java_app_baitbuddy_mobile_llm_LlamaNative_nativeUnload(JNIEnv *, jclass) {
    engine().unload();
}

JNIEXPORT void JNICALL
Java_app_baitbuddy_mobile_llm_LlamaNative_nativeCancel(JNIEnv *, jclass) {
    engine().cancel();
}

JNIEXPORT jstring JNICALL
Java_app_baitbuddy_mobile_llm_LlamaNative_nativeDescribe(JNIEnv * env, jclass) {
    return env->NewStringUTF(json_escape(engine().describe()).c_str());
}

// Liefert ein JSON-Objekt als UTF-8-Bytes:
// {"ok":true,"promptTokens":..,"reusedTokens":..,"generatedTokens":..,
//  "promptMs":..,"generateMs":..,"stopReason":".."} bzw. {"ok":false,"error":".."}
JNIEXPORT jbyteArray JNICALL
Java_app_baitbuddy_mobile_llm_LlamaNative_nativeGenerate(
        JNIEnv * env, jclass,
        jbyteArray prefix, jbyteArray suffix, jint max_tokens,
        jfloat temperature, jfloat top_p, jint top_k, jfloat min_p, jfloat repeat_penalty,
        jbyteArray checkpoint_path, jobjectArray stops, jobject callback) {
    bbllm::GenerateParams params;
    params.prefix = bytes_to_string(env, prefix);
    params.suffix = bytes_to_string(env, suffix);
    params.max_tokens = max_tokens;
    params.temperature = temperature;
    params.top_p = top_p;
    params.top_k = top_k;
    params.min_p = min_p;
    params.repeat_penalty = repeat_penalty;
    params.checkpoint_path = bytes_to_string(env, checkpoint_path);
    if (stops) {
        const jsize n = env->GetArrayLength(stops);
        for (jsize i = 0; i < n; ++i) {
            auto item = static_cast<jbyteArray>(env->GetObjectArrayElement(stops, i));
            params.stop.push_back(bytes_to_string(env, item));
            env->DeleteLocalRef(item);
        }
    }

    jclass cb_class = callback ? env->GetObjectClass(callback) : nullptr;
    jmethodID on_token = cb_class ? env->GetMethodID(cb_class, "onToken", "([B)Z") : nullptr;

    bbllm::GenerateStats stats;
    std::string error;
    const bool ok = engine().generate(params, [&](const std::string & piece) -> bool {
        if (!on_token) return true;
        jbyteArray bytes = string_to_bytes(env, piece);
        const jboolean keep_going = env->CallBooleanMethod(callback, on_token, bytes);
        env->DeleteLocalRef(bytes);
        if (env->ExceptionCheck()) {
            env->ExceptionClear();
            return false;
        }
        return keep_going == JNI_TRUE;
    }, stats, error);

    std::string json;
    if (ok) {
        json = "{\"ok\":true,\"promptTokens\":" + std::to_string(stats.prompt_tokens) +
               ",\"reusedTokens\":" + std::to_string(stats.reused_tokens) +
               ",\"generatedTokens\":" + std::to_string(stats.generated_tokens) +
               ",\"promptMs\":" + std::to_string(static_cast<long long>(stats.prompt_ms)) +
               ",\"generateMs\":" + std::to_string(static_cast<long long>(stats.generate_ms)) +
               ",\"stopReason\":\"" + json_escape(stats.stop_reason) + "\"}";
    } else {
        json = "{\"ok\":false,\"error\":\"" + json_escape(error) + "\"}";
    }
    return string_to_bytes(env, json);
}

}  // extern "C"
