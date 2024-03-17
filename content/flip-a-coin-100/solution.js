function memorize(f) {
  let cache = new Map();
  return function(...args) {
    let key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    let result = f(...args);
    cache.set(key, result);
    return result;
  };
}

// BigInt used here because the number involved is on the order of 2^100

const Q_H = memorize((n, s_A, s_B) => {
  if (n < 2) {
    throw new Error('n must be at least 2');
  }
  if (n == 2) {
    return ((s_A == 1 && s_B == 0) || (s_A == 0 && s_B == 0)) ? 1n : 0n;
  }
  return Q_H(n - 1, s_A - 1, s_B) + Q_T(n - 1, s_A, s_B);
});

const Q_T = memorize((n, s_A, s_B) => {
  if (n < 2) {
    throw new Error('n must be at least 2');
  }
  if (n == 2) {
    return ((s_A == 0 && s_B == 1) || (s_A == 0 && s_B == 0)) ? 1n : 0n;
  }
  return Q_H(n - 1, s_A, s_B - 1) + Q_T(n - 1, s_A, s_B);
});

const Q = (n, s_A, s_B) => Q_H(n, s_A, s_B) + Q_T(n, s_A, s_B);

// Some test cases
function assert_eq(a, b) {
  if (a !== b) {
    throw new Error(`Expected ${a} to equal ${b}`);
  }
}

assert_eq(Q(2, 1, 0), 1n);
assert_eq(Q(2, 0, 1), 1n);

// HHH, HHT, HTH, HTT, THH, THT, TTH, TTT
// A:2    1    0    0    1    0    0    0
// B:0    1    1    1    0    1    0    0

assert_eq(Q(3, 0, 0), 2n);
assert_eq(Q(3, 0, 1), 3n);
assert_eq(Q(3, 1, 0), 1n);
assert_eq(Q(3, 1, 1), 1n);
assert_eq(Q(3, 2, 0), 1n);
assert_eq(Q(3, 2, 1), 0n);

function sum(bottom, top, f) {
  let sum = 0n;
  for (let i = bottom; i <= top; i++) {
    sum += f(i);
  }
  return sum;
}

function div_by_2_100(bigint) {
  const PERCISION = 10000n;
  return Number((bigint * PERCISION) / (2n ** 100n)) / Number(PERCISION);
}

const P_sA_gt_sB = div_by_2_100(sum(1, 99, s_A => sum(0, s_A - 1, s_B => Q(100, s_A, s_B))));
const P_sB_gt_sA = div_by_2_100(sum(1, 50, s_B => sum(0, s_B - 1, s_A => Q(100, s_A, s_B))));

console.log(`Alice wins ${P_sA_gt_sB * 100}% of the time`);
console.log(`Bob wins ${P_sB_gt_sA * 100}% of the time`);

let a_avg = 0n;
let b_avg = 0n;
let total_sum = 0n;

console.log("score,a_prob,b_prob")
for (let score = 0; score <= 99; score += 1) {
  let a_sum = sum(0, 99, s_B => Q(100, score, s_B));
  let b_sum = sum(0, 99, s_A => Q(100, s_A, score));
  a_avg += BigInt(score) * a_sum;
  b_avg += BigInt(score) * b_sum;
  total_sum += a_sum + b_sum;
  console.log(`${score},${div_by_2_100(a_sum)},${div_by_2_100(b_sum)}`);
}
a_avg = div_by_2_100(a_avg);
b_avg = div_by_2_100(b_avg);
console.log(`Average score for Alice: ${a_avg}, Bob: ${b_avg}`);
assert_eq(total_sum, 2n ** 100n * 2n);
