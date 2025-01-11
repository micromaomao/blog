all: fork-test my-hackme my-hackme-looped

clean:
	rm -f fork-test my-hackme my-hackme-looped syscall_regs_test syscall_regs_test.o

fork-test: fork-test.c
	gcc -o fork-test fork-test.c -O3

my-hackme: my-hackme.cpp
	g++ -static -Og -g my-hackme.cpp -o my-hackme

my-hackme-looped: my-hackme-looped.cpp
	g++ -static -Og -g my-hackme-looped.cpp -o my-hackme-looped

syscall_regs_test: syscall_regs_test.S
	as -o syscall_regs_test.o -g syscall_regs_test.S
	ld -o syscall_regs_test syscall_regs_test.o
