if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "/Users/sanjeetkumar/.gradle/caches/9.0.0/transforms/4417913d27a928b7fe1d26ece089213d/transformed/hermes-android-250829098.0.9-debug/prefab/modules/hermesvm/libs/android.x86/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/sanjeetkumar/.gradle/caches/9.0.0/transforms/4417913d27a928b7fe1d26ece089213d/transformed/hermes-android-250829098.0.9-debug/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

