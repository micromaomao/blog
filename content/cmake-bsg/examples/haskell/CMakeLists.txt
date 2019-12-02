project(haskell_hello NONE)

find_program(GHC ghc)
if(${GHC} STREQUAL "GHC-NOTFOUND")
  message(SEND_ERROR "did not find the ghc haskell compiler.")
endif()

function(add_haskell_executable)
  unset(exe_name)
  set(byproducts "")
  set(srcs "")
  foreach(arg ${ARGN})
    if(NOT DEFINED exe_name)
      set(exe_name ${arg})
    else()
      string(REGEX REPLACE "\\.hs$" "" srcfile_we ${arg})
      list(APPEND byproducts "${srcfile_we}.o" "${srcfile_we}.hi")
      list(APPEND srcs ${arg})
    endif()
  endforeach()
  add_custom_command(
    OUTPUT ${exe_name}
    COMMAND ghc ${srcs}
    COMMENT "ghc ..."
    DEPENDS ${srcs}
    BYPRODUCTS ${byproducts}
  )
  add_custom_target(
    bin_${exe_name}
    ALL
    DEPENDS ${exe_name}
  )
endfunction()

add_haskell_executable(main hello.hs main.hs)
