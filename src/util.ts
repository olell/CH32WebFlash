export function hexdump(data: Uint8Array) {
  let output = "";
  output +=
    "[HEX]\t         0 -     ADDR | 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F   ASCII\n";
  output +=
    "                 * - ---------+------------------------------------------------   ----------------\n";

  const length = data.length;
  for (let r = 0; r < length; r += 0x10) {
    output += `                 * - ${r.toString(16).padStart(8, "0")} |`;
    // Hex bytes
    for (let c = 0; c < 0x10; c++) {
      if (r + c < length) {
        const val = data[r + c];
        output += ` ${val.toString(16).padStart(2, "0")}`;
      } else {
        output += "   ";
      }
    }
    output += "   ";
    // ASCII
    for (let c = 0; c < 0x10; c++) {
      if (r + c < length) {
        const val = data[r + c];
        if (val >= 0x20 && val < 0x7f) {
          output += String.fromCharCode(val);
        } else {
          output += ".";
        }
      } else {
        output += ".";
      }
    }
    output += "   \n";
  }
  output += `                 * - ------------------ DUMPED ${length
    .toString()
    .padStart(6, " ")} BYTES -------------------   ----------------\n`;
  console.log(output);
}
