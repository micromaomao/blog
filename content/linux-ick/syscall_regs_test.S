# Compile with:
#   as -o syscall_regs_test.o -g syscall_regs_test.S
#   ld -o syscall_regs_test syscall_regs_test.o

.section .data
msg: .ascii "Nope! Read: "
msgLen = . - msg

errMsg: .ascii "Assertion failed\n"
errMsgLen = . - errMsg

.section .bss
.stack:
  .lcomm stack, 4096
.buffer:
  .lcomm buffer, 128

.section .text
.globl _start
_start:
  lea stack(%rip), %rsp

  # Add some sentinel values to check if registers are restored correctly
  # both registers below should be restored correctly.
  # callee-saved
  movq $0x1234567812345678, %r15
  # caller-saved
  # don't use r11 because syscall clobbers it (saves eflags)
  movq $0x8765432187654321, %r10

  # Save something on our "stack" as well
  movq $0x2323232323232323, %rax
  pushq %rax

  movl $0, %eax                   # sys_read
  movl $0, %edi                   # fd = stdin
  lea buffer + msgLen(%rip), %rsi # buf = buffer + msgLen
  movl $(128 - msgLen), %edx      # count
  syscall

  movq %rax, %rdx # ret is num bytes read

  # memcpy(dst=buffer, src=msg, count=msgLen)
  lea msg(%rip), %rsi
  lea buffer(%rip), %rdi
  movl $msgLen, %ecx
  rep movsb

  # assert sentinel values intact
  movq $0x2323232323232323, %rbx
  popq %rax
  cmpq %rax, %rbx
  jnz .Lerror

  movq $0x8765432187654321, %rbx
  cmpq %r10, %rbx
  jnz .Lerror

  movq $0x1234567812345678, %rbx
  cmpq %r15, %rbx
  jnz .Lerror

  # clobber previously saved sentinel values
  movq $-1, %r15
  movq $-1, %r10
  # destroy the sentinel on our "stack" as well
  # don't use push/pop so that if rsp is not restored correctly eventually we
  # will crash
  movq $-1, -16(%rsp)

  movl $1, %eax          # sys_write
  movl $1, %edi          # fd = stdout
  lea buffer(%rip), %rsi # buf = buffer
  # count = ret + msgLen
  # %rdx previously set by saving ret from the read into it
  addq $msgLen, %rdx
  syscall

  movl $60, %eax  # sys_exit
  xorl %edi, %edi # error_code = 0
  syscall

.Lerror:
  movl $1, %eax          # sys_write
  movl $2, %edi          # fd = stderr
  lea errMsg(%rip), %rsi # buf = errMsg
  movl $errMsgLen, %edx  # count = errMsgLen
  syscall
  ud2
