#include <cstring>
#include <iostream>
#include <random>

using namespace std;

int main(int argc, char const *argv[]) {
  default_random_engine reng((random_device())());
  uniform_int_distribution<int> distr(0, 3000000);
  int correct_number = distr(reng);

  while (true) {
    cout << "Enter number: " << flush;
    int num;
    cin >> num;

    if (num == correct_number) {
      cout << "Correct!" << endl;
      return 0;
    } else {
      cout << "Nope! " << num << " was a wrong guess. The correct number is "
          << correct_number << "." << endl;
    }
  }
}
