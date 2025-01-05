all: fork-test my-hackme my-hackme-looped

fork-test: fork-test.c
	gcc -o fork-test fork-test.c -O3

my-hackme: my-hackme.cpp
	g++ -static -Og -g my-hackme.cpp -o my-hackme

my-hackme-looped: my-hackme-looped.cpp
	g++ -static -Og -g my-hackme-looped.cpp -o my-hackme-looped
