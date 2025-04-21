all: fork-test my-hackme my-hackme-looped my-hackme-syscall syscall_regs_test fork-debug mem_overcommit_test

clean:
	rm -f fork-test my-hackme my-hackme-looped my-hackme-syscall syscall_regs_test syscall_regs_test.o fork-debug mem_overcommit_test

fork-test: fork-test.c
	gcc -o fork-test fork-test.c -O3

my-hackme: my-hackme.cpp
	g++ -static -Og -g my-hackme.cpp -o my-hackme

my-hackme-looped: my-hackme-looped.cpp
	g++ -static -Og -g my-hackme-looped.cpp -o my-hackme-looped

my-hackme-syscall: my-hackme-syscall.cpp
	g++ -static -Og -g my-hackme-syscall.cpp -o my-hackme-syscall

syscall_regs_test: syscall_regs_test.S
	as -o syscall_regs_test.o -g syscall_regs_test.S
	ld -o syscall_regs_test syscall_regs_test.o

fork-debug: fork-debug.c
	gcc -o fork-debug fork-debug.c -Og -g

mem_overcommit_test: mem_overcommit_test.c
	gcc -o mem_overcommit_test -static mem_overcommit_test.c -Og -g
