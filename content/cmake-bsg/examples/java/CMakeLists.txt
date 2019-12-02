# Note: this is not the recommended way to build java project. This is just a
# demonstration of cmake's function. I'm not a java programmer. Try running
# make, then change void hello() to void helloa() and then run make run.

project(java_hello NONE) # Use the "None" language to avoid cmake probing C compiler

find_program(JAVAC javac)
if("${JAVAC}" STREQUAL "JAVAC-NOTFOUND")
  message(SEND_ERROR "javac not found")
endif()
find_program(JAR jar)

function(add_java_jar)
  unset(jar_name)
  unset(main_class_name)
  set(include_in_jar "")
  foreach(arg ${ARGN})
    if(NOT DEFINED jar_name)
      set(jar_name ${arg})
    elseif(NOT DEFINED main_class_name)
      set(main_class_name ${arg})
    else()
      string(REGEX REPLACE "\\.java$" ".class" class_file ${arg})
      list(APPEND include_in_jar ${class_file})
      add_custom_command(
        OUTPUT ${class_file}
        COMMAND ${JAVAC} ${arg}
        DEPENDS ${arg}
        COMMENT "javac ${arg}"
      )
    endif()
  endforeach()
  add_custom_command(
    OUTPUT ${jar_name}
    COMMAND ${JAR} cfe ${jar_name} ${main_class_name} ${include_in_jar}
    DEPENDS ${include_in_jar}
    COMMENT "jar ${jar_name}"
  )
  get_filename_component(jar_name_we ${jar_name} NAME_WLE)
  add_custom_target(
    jar_${jar_name}
    ALL DEPENDS ${jar_name}
  )
  add_custom_target(
    run_${jar_name_we}
    DEPENDS ${jar_name}
    COMMAND java -jar ${jar_name}
    COMMENT "java -jar ${jar_name}"
  )
endfunction()

# Match every java files
file(GLOB_RECURSE srcs RELATIVE "${CMAKE_CURRENT_SOURCE_DIR}" *.java)
add_java_jar(hello.jar org.maowtm.main ${srcs})
