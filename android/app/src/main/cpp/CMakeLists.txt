# Native Bibliothek des lokalen KI-Buddys (llama.cpp + Qwen3.5 GGUF).
#
# llama.cpp wird zur Build-Zeit auf einen festen Release-Tag gezogen und gegen
# den erwarteten Commit geprueft (Lieferketten-Schutz). Fuer Offline-Builds
# oder lokale Entwicklung laesst sich ein vorhandener Checkout per
# -DLLAMA_CPP_DIR=/pfad/zu/llama.cpp einbinden.
#
# Die Build-Optionen folgen der offiziellen Android-Bindung von llama.cpp
# (examples/llama.android): Alle CPU-Varianten werden als eigene Backends gebaut
# (armv8.0 bis armv9.2 mit DOTPROD/I8MM/SVE) und zur Laufzeit passend zum
# Prozessor geladen — deshalb muessen die .so-Dateien entpackt installiert werden
# (useLegacyPackaging in app/build.gradle).

cmake_minimum_required(VERSION 3.22.1)
project(baitbuddy_llm LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(BB_LLAMA_CPP_TAG "b11175")
set(BB_LLAMA_CPP_COMMIT "4de092659663c1f74c80f8e8f6ade33e87d50077")

set(BB_LLM_FULL ON)
if(ANDROID AND NOT (ANDROID_ABI STREQUAL "arm64-v8a" OR ANDROID_ABI STREQUAL "x86_64"))
    set(BB_LLM_FULL OFF)
endif()

if(NOT BB_LLM_FULL)
    add_library(baitbuddy_llm SHARED bb_llm_stub.cpp)
    return()
endif()

# --- llama.cpp-Optionen -------------------------------------------------------
set(BUILD_SHARED_LIBS      ON  CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON     OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS      OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS      OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES   OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER     OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP        OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL          OFF CACHE BOOL "" FORCE)
set(LLAMA_SUBPROCESS       OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE            OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE         OFF CACHE BOOL "" FORCE)
# KleidiAI beschleunigt Q4_0/Q8_0; wir laden Q4_K_M. Aus, spart den
# zusaetzlichen Download beim Build.
set(GGML_CPU_KLEIDIAI      OFF CACHE BOOL "" FORCE)
if(ANDROID)
    set(GGML_BACKEND_DL        ON CACHE BOOL "" FORCE)
    set(GGML_CPU_ALL_VARIANTS  ON CACHE BOOL "" FORCE)
    if(ANDROID_ABI STREQUAL "arm64-v8a")
        set(GGML_OPENMP ON  CACHE BOOL "" FORCE)
    else()
        set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
    endif()
endif()

# --- llama.cpp-Quellen ----------------------------------------------------------
if(DEFINED LLAMA_CPP_DIR)
    set(BB_LLAMA_SRC "${LLAMA_CPP_DIR}")
else()
    include(FetchContent)
    # SOURCE_SUBDIR zeigt absichtlich ins Leere: MakeAvailable laedt nur herunter,
    # eingebunden wird erst nach der Commit-Pruefung.
    FetchContent_Declare(llama_cpp
        GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git
        GIT_TAG        ${BB_LLAMA_CPP_TAG}
        GIT_SHALLOW    TRUE
        GIT_PROGRESS   FALSE
        SOURCE_SUBDIR  bb-no-auto-add)
    FetchContent_MakeAvailable(llama_cpp)
    set(BB_LLAMA_SRC "${llama_cpp_SOURCE_DIR}")

    find_package(Git REQUIRED)
    execute_process(
        COMMAND ${GIT_EXECUTABLE} rev-parse HEAD
        WORKING_DIRECTORY "${BB_LLAMA_SRC}"
        OUTPUT_VARIABLE BB_LLAMA_HEAD
        OUTPUT_STRIP_TRAILING_WHITESPACE)
    if(NOT BB_LLAMA_HEAD STREQUAL BB_LLAMA_CPP_COMMIT)
        message(FATAL_ERROR "llama.cpp ${BB_LLAMA_CPP_TAG}: erwartet ${BB_LLAMA_CPP_COMMIT}, erhalten '${BB_LLAMA_HEAD}'")
    endif()
endif()

add_subdirectory("${BB_LLAMA_SRC}" build-llama)

# --- BaitBuddy-Bibliothek ------------------------------------------------------
add_library(baitbuddy_llm SHARED bb_llm_engine.cpp bb_llm_jni.cpp)
target_include_directories(baitbuddy_llm PRIVATE
    "${BB_LLAMA_SRC}/include"
    "${BB_LLAMA_SRC}/ggml/include")
target_link_libraries(baitbuddy_llm PRIVATE llama)
# Kennung im Kopf gespeicherter Checkpoints: Nach einem llama.cpp-Update werden
# alte Dateien verworfen statt mit geaendertem Zustandsformat eingelesen.
target_compile_definitions(baitbuddy_llm PRIVATE BB_LLAMA_TAG="${BB_LLAMA_CPP_TAG}")
if(ANDROID)
    target_link_libraries(baitbuddy_llm PRIVATE android log)
else()
    find_package(JNI REQUIRED)
    target_include_directories(baitbuddy_llm PRIVATE ${JNI_INCLUDE_DIRS})
endif()
