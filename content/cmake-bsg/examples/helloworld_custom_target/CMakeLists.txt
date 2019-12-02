project(helloworld)

add_custom_command(
  OUTPUT hello.o
  DEPENDS hello.c
  COMMAND gcc -c hello.c -o hello.o
)

add_custom_command(
  OUTPUT helloworld
  DEPENDS hello.o
  COMMAND gcc hello.o -o helloworld
)

add_custom_target(bin ALL DEPENDS helloworld)
