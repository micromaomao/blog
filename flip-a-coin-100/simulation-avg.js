const seq_len = 100;
const n_runs = 50000000;

let a_score_sum = 0;
let b_score_sum = 0;
let a_score_squred_sum = 0;
let b_score_squred_sum = 0;

function run() {
  let sequence = Array.from({ length: seq_len }, () => Math.random() > 0.5 ? 'H' : 'T');
  let a_score = sequence.filter((_, i) => i < seq_len - 1 && sequence[i] == 'H' && sequence[i + 1] == 'H').length;
  let b_score = sequence.filter((_, i) => i < seq_len - 1 && sequence[i] == 'H' && sequence[i + 1] == 'T').length;

  a_score_sum += a_score;
  b_score_sum += b_score;
  a_score_squred_sum += a_score * a_score;
  b_score_squred_sum += b_score * b_score;
}

function standard_dev(x_sum, x2_sum, n_samples) {
  return 1 / (n_samples - 1) * (x2_sum - x_sum * x_sum / n_samples);
}

function print_stats(current_n) {
  let a_std = standard_dev(a_score_sum, a_score_squred_sum, current_n) / Math.sqrt(current_n);
  let b_std = standard_dev(b_score_sum, b_score_squred_sum, current_n) / Math.sqrt(current_n);
  // https://www.wolframalpha.com/input?i=standard+normal+distribution+inverse+cdf+%2F.+x+%3D+0.995
  const ci99 = 2.57583;
  let a_avg = a_score_sum / current_n;
  let b_avg = b_score_sum / current_n;
  let a_uncertainty = a_std * ci99;
  let b_uncertainty = b_std * ci99;
  console.log(`Average Alice: ${a_avg} +- ${a_uncertainty}, Bob: ${b_avg} +- ${b_uncertainty}`);
  if (a_avg - a_uncertainty > b_avg + b_uncertainty) {
    console.log('Alice is higher');
  } else if (b_avg - b_uncertainty > a_avg + a_uncertainty) {
    console.log('Bob is higher');
  } else {
    console.log('No significant difference with p = 0.01');
  }
}

for (let i = 0; i < n_runs; i++) {
  run();
  if (i % 100000 == 0) {
    print_stats(i + 1);
  }
}
console.log(`Average Alice: ${a_score_sum / n_runs}, Bob: ${b_score_sum / n_runs}, Ratio: ${a_score_sum / b_score_sum}`);
