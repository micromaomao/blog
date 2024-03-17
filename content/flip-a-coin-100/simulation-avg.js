const seq_len = 100;
const n_runs = 50000000;

let a_score_sum = 0;
let b_score_sum = 0;

function run() {
  let sequence = Array.from({ length: seq_len }, () => Math.random() > 0.5 ? 'H' : 'T');
  let a_score = sequence.filter((_, i) => i < seq_len - 1 && sequence[i] === 'H' && sequence[i + 1] === 'H').length;
  let b_score = sequence.filter((_, i) => i < seq_len - 1 && sequence[i] === 'H' && sequence[i + 1] === 'T').length;

  a_score_sum += a_score;
  b_score_sum += b_score;
}

for (let i = 0; i < n_runs; i++) {
  run();
  if (i % 100000 === 0) {
    console.log(`${i / n_runs}: Average Alice: ${a_score_sum / (i + 1)}, Bob: ${b_score_sum / (i + 1)}`);
  }
}
console.log(`Average Alice: ${a_score_sum / n_runs}, Bob: ${b_score_sum / n_runs}`);
