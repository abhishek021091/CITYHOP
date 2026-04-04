if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "/Users/sanjeetkumar/.gradle/caches/9.0.0/transforms/6b337e8aa2b6c3d669817623b94f8f60/transformed/fbjni-0.7.0/prefab/modules/fbjni/libs/android.arm64-v8a/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/sanjeetkumar/.gradle/caches/9.0.0/transforms/6b337e8aa2b6c3d669817623b94f8f60/transformed/fbjni-0.7.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

