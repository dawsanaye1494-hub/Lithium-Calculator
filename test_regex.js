const headers = ["cell1(v)", "cell_01(v)", "cell1 voltage", "c1", "soc", "mac1"];

for (let c = 1; c <= 2; c++) {
  const cStr = String(c);
  const regex = new RegExp(`(?:^|\\b)(?:cell|c)[\\s_]*0?${cStr}(?:\\b|[^0-9])`, 'i');
  console.log(`Cell ${c}:`, headers.filter(h => regex.test(h)));
}
