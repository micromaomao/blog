#include <cstring>
#include <iostream>
#include <random>

using namespace std;

int main(int argc, char const *argv[]) {
  default_random_engine reng((random_device())());
  uniform_int_distribution<int> distr(0, 3000000);
  int correct_number = distr(reng);

  const size_t buf_size = 200;
  unsigned char *some_buf = (unsigned char *)malloc(buf_size);
  memset(some_buf, 0xff, buf_size);

  asm volatile("" ::: "memory");

  cout << "Enter number: " << flush;
  int num;
  cin >> num;

  asm volatile("" ::: "memory");

  for (size_t i = 0; i < buf_size; i += 1) {
    if (some_buf[i] != 0xff) {
      cout << "Oops, you broke my buffer at " << some_buf << endl;
      return 0;
    }
    some_buf[i] = 0;
  }

  if (num == correct_number) {
    cout << "Correct!" << endl;
  } else {
    cout << "Nope! " << num << " was a wrong guess. The correct number is "
         << correct_number << "." << endl;
  }
  return 0;
}
