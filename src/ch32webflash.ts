/**
 * Javascript / WebHID implementation of minichlink/pgm-b003fun
 *
 * This tool can interact with the rv003 USB-bootloader by CNLohr
 * to flash ch32v003 devices directly from the browser.
 *
 * ToDo-List:
 * - implementation of the core functions
 * - implementation of the terminal functionallity
 *
 * The WebHID API availibility is limited, so this code works only
 * on Chrome, Edge and Opera browsers. Use the `getBrowserCompatibility()`
 * function to check if it would work.
 *
 * This code is heavily based on
 *  - https://github.dev/cnlohr/ch32fun/blob/master/minichlink/pgm-b003fun.c
 *  - + other minichlink code
 * Licensed under MIT by CNLohr et al.
 *
 */

import { hexdump } from "./util";

const DEBUG_B003 = false;

/* equiv to memcpy */
function arrcpy(
  arr: Uint8Array,
  position: number,
  data: Uint8Array,
  size?: number,
) {
  if (!!!size) size = data.length;
  if (position + size > arr.length) {
    console.warn("arrcpy size overflow:", position, size);
    return arr;
  }
  for (let i = 0; i < size; i++) {
    arr[position + i] = data[i];
  }
  return arr;
}

/* equiv to memcmp */
function arrcmp(arr1: Uint8Array, arr2: Uint8Array, size: number) {
  if (arr1.length < size || arr2.length < size) return -1;
  for (let i = 0; i < size; i++) {
    if (arr1[i] !== arr2[i]) return arr1[i] - arr2[i];
  }
  return 0;
}

// prettier-ignore
const byte_wise_read_blob = new Uint8Array([ // No alignment restrictions.
	0x23, 0xa0, 0x05, 0x00, 0x13, 0x07, 0x45, 0x03, 0x0c, 0x43, 0x50, 0x43,
	0x2e, 0x96, 0x21, 0x07, 0x94, 0x21, 0x14, 0xa3, 0x85, 0x05, 0x05, 0x07,
	0xe3, 0xcc, 0xc5, 0xfe, 0x93, 0x06, 0xf0, 0xff, 0x14, 0xc1, 0x82, 0x80,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);
// prettier-ignore
const half_wise_read_blob = new Uint8Array([  // size and address must be aligned by 2.
	0x23, 0xa0, 0x05, 0x00, 0x13, 0x07, 0x45, 0x03, 0x0c, 0x43, 0x50, 0x43,
	0x2e, 0x96, 0x21, 0x07, 0x96, 0x21, 0x16, 0xa3, 0x89, 0x05, 0x09, 0x07,
	0xe3, 0xcc, 0xc5, 0xfe, 0x93, 0x06, 0xf0, 0xff, 0x14, 0xc1, 0x82, 0x80,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);
// prettier-ignore
const word_wise_read_blob = new Uint8Array([ // size and address must be aligned by 4.
	0x23, 0xa0, 0x05, 0x00, 0x13, 0x07, 0x45, 0x03, 0x0c, 0x43, 0x50, 0x43,
	0x2e, 0x96, 0x21, 0x07, 0x94, 0x41, 0x14, 0xc3, 0x91, 0x05, 0x11, 0x07,
	0xe3, 0xcc, 0xc5, 0xfe, 0x93, 0x06, 0xf0, 0xff, 0x14, 0xc1, 0x82, 0x80,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);
// prettier-ignore
const word_wise_write_blob = new Uint8Array([ // size and address must be aligned by 4.
	0x23, 0xa0, 0x05, 0x00, 0x13, 0x07, 0x45, 0x03, 0x0c, 0x43, 0x50, 0x43,
	0x2e, 0x96, 0x21, 0x07, 0x14, 0x43, 0x94, 0xc1, 0x91, 0x05, 0x11, 0x07,
	0xe3, 0xcc, 0xc5, 0xfe, 0x93, 0x06, 0xf0, 0xff, 0x14, 0xc1, 0x82, 0x80, // NOTE: No readback!
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
/*
	0x23, 0xa0, 0x05, 0x00, 0x13, 0x07, 0x45, 0x03, 0x0c, 0x43, 0x50, 0x43,
	0x2e, 0x96, 0x21, 0x07, 0x14, 0x43, 0x94, 0xc1, 0x94, 0x41, 0x14, 0xc3, // With readback.
	0x91, 0x05, 0x11, 0x07, 0xe3, 0xca, 0xc5, 0xfe, 0x93, 0x06, 0xf0, 0xff,
	0x14, 0xc1, 0x82, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 */
]);
// prettier-ignore
const write64_flash = new Uint8Array([ // size and address must be aligned by 4.
  0x13, 0x07, 0x45, 0x03, 0x0c, 0x43, 0x13, 0x86, 0x05, 0x04, 0x5c, 0x43,
  0x8c, 0xc7, 0x14, 0x47, 0x94, 0xc1, 0xb7, 0x06, 0x05, 0x00, 0xd4, 0xc3,
  0x94, 0x41, 0x91, 0x05, 0x11, 0x07, 0xe3, 0xc8, 0xc5, 0xfe, 0xc1, 0x66,
  0x93, 0x86, 0x06, 0x04, 0xd4, 0xc3, 0xfd, 0x56, 0x14, 0xc1, 0x82, 0x80
]);
// prettier-ignore
const half_wise_write_blob = new Uint8Array([ // size and address must be aligned by 2
	0x23, 0xa0, 0x05, 0x00, 0x13, 0x07, 0x45, 0x03, 0x0c, 0x43, 0x50, 0x43,
	0x2e, 0x96, 0x21, 0x07, 0x16, 0x23, 0x96, 0xa1, 0x96, 0x21, 0x16, 0xa3,
	0x89, 0x05, 0x09, 0x07, 0xe3, 0xca, 0xc5, 0xfe, 0x93, 0x06, 0xf0, 0xff,
	0x14, 0xc1, 0x82, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);
// prettier-ignore
const byte_wise_write_blob = new Uint8Array([ // no division requirements.
	0x23, 0xa0, 0x05, 0x00, 0x13, 0x07, 0x45, 0x03, 0x0c, 0x43, 0x50, 0x43,
	0x2e, 0x96, 0x21, 0x07, 0x14, 0x23, 0x94, 0xa1, 0x94, 0x21, 0x14, 0xa3,
	0x85, 0x05, 0x05, 0x07, 0xe3, 0xca, 0xc5, 0xfe, 0x93, 0x06, 0xf0, 0xff,
	0x14, 0xc1, 0x82, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

// Just set the countdown to 0 to avoid any issues.
//   li a3, 0; sw a3, 0(a1); li a3, -1; sw a3, 0(a0); ret;
// prettier-ignore
const halt_wait_blob = new Uint8Array([
	0x81, 0x46, 0x94, 0xc1, 0xfd, 0x56, 0x14, 0xc1, 0x82, 0x80 ]);

// Set the countdown to -1 to cause main system to execute.
//   li a3, -1; sw a3, 0(a1); li a3, -1; sw a3, 0(a0); ret;
//static const unsigned char run_app_blob[] = {
//	0xfd, 0x56, 0x94, 0xc1, 0xfd, 0x56, 0x14, 0xc1, 0x82, 0x80 };
//
// Alternatively, we do it ourselves.

// Run app blob (old):
// static const unsigned char run_app_blob[] = {
// 	0x37, 0x07, 0x67, 0x45, 0xb7, 0x27, 0x02, 0x40, 0x13, 0x07, 0x37, 0x12,
// 	0x98, 0xd7, 0x37, 0x97, 0xef, 0xcd, 0x13, 0x07, 0xb7, 0x9a, 0x98, 0xd7,
// 	0x23, 0xa6, 0x07, 0x00, 0x13, 0x07, 0x00, 0x08, 0x98, 0xcb, 0xb7, 0xf7,
// 	0x00, 0xe0, 0x37, 0x07, 0x00, 0x80, 0x23, 0xa8, 0xe7, 0xd0, 0x82, 0x80,
// };

// Run app blob (new):
// prettier-ignore
const run_app_blob = new Uint8Array([
	0xb7,0xf5,0xff,0x1f,  // li     a1,0x1FFFF000   - load offset to a1
	0x93,0x87,0xc5,0x77,  // addi   a5,a1,0x77C     - load absolute address of secret area to a5
	0x03,0xa7,0x07,0x00,  // lw     a4,0(a5)        - load reboot function offset + xor from secret to a4
	0x13,0x57,0x07,0x01,  // srli   a4,a4,16        - shift it to remove lower part (offset)
	0x83,0x96,0x07,0x00,  // lh     a3,0(a5)        - load offset part to a3
	0x93,0xc7,0xc6,0x77,  // xori   a5,a3,0x77C     - find current xor
	0x63,0x16,0xf7,0x00,  // bne    a4,a5,.L2       - if xor is valid
	0x33,0x87,0xb6,0x00,  // add    a4, a3, a1      - make absolute address of reboot function an jump
	0x67,0x00,0x07,0x00,  // jr     a4              - jump to it
  /* else - means that we didn't find a reboot function address
	and need to send the blob to do a reboot
.L2:                                                - Same sequence as in "Run app blob (old)"*/
	0xb7,0x27,0x02,0x40,  // li     a5,1073881088
	0x93,0x87,0x87,0x02,  // addi   a5,a5,40
	0x37,0x07,0x67,0x45,  // li     a4,1164378112
	0x13,0x07,0x37,0x12,  // addi   a4,a4,291
	0x23,0xa0,0xe7,0x00,  // sw     a4,0(a5)
	0xb7,0x27,0x02,0x40,  // li     a5,1073881088
	0x93,0x87,0x87,0x02,  // addi   a5,a5,40
	0x37,0x97,0xef,0xcd,  // li     a4,-839938048
	0x13,0x07,0xb7,0x9a,  // addi   a4,a4,-1621
	0x23,0xa0,0xe7,0x00,  // sw     a4,0(a5)
	0xb7,0x27,0x02,0x40,  // li     a5,1073881088
	0x93,0x87,0xc7,0x00,  // addi   a5,a5,12
	0x23,0xa0,0x07,0x00,  // sw     zero,0(a5)
	0xb7,0x27,0x02,0x40,  // li     a5,1073881088
	0x93,0x87,0x07,0x01,  // addi   a5,a5,16
	0x13,0x07,0x00,0x08,  // li     a4,128
	0x23,0xa0,0xe7,0x00,  // sw     a4,0(a5)
	0xb7,0xf7,0x00,0xe0,  // li     a5,-536809472
	0x93,0x87,0x07,0xd1,  // addi   a5,a5,-752
	0x37,0x07,0x00,0x80,  // li     a4,-2147483648
	0x23,0xa0,0xe7,0x00,  // sw     a4,0(a5)
]);

enum HaltMode {
  HaltAndReset = 0,
  Reboot = 1,
  Resume = 2,
  GoToBootloader = 3,
  HaltButNoReset = 5,
}

function isAddressFlash(addr: number) {
  return (
    (addr & 0xff000000) === 0x08000000 || (addr & 0x1fff0000) === 0x1fff0000
  );
}

const MAX_FLASH_SECTORS = 262144;

class InternalState {
  statetag: number; // uint32_t
  currentstateval: number; // uint32_t
  flash_unlocked: number; // uint32_t
  lastwriteflags: number; // int
  processor_in_mode: number; // int
  autoincrement: number; // int
  ram_base: number; // uint32_t
  ram_size: number; // uint32_t
  sector_size: number; // int
  flash_size: number; // int
  //target_chip_type: RiscVChip; // enum, type unknown
  target_chip_id: number; // uint32_t
  flash_sector_status: Uint8Array; // 0 means unerased/unknown. 1 means erased.
  nr_registers_for_debug: number; // int, updated by PostSetupConfigureInterface

  constructor() {
    this.statetag = 0;
    this.currentstateval = 0;
    this.flash_unlocked = 0;
    this.lastwriteflags = 0;
    this.processor_in_mode = 0;
    this.autoincrement = 0;
    this.ram_base = 0;
    this.ram_size = 0;
    this.sector_size = 64;
    this.flash_size = 0;
    //this.target_chip_type = RiscVChip.CHIP_UNKNOWN;
    this.target_chip_id = 0;
    this.flash_sector_status = new Uint8Array(MAX_FLASH_SECTORS).fill(0);
    this.nr_registers_for_debug = 32;
  }
}

class B003Device {
  vid: number;
  pid: number;
  hd: HIDDevice | null;
  commandbuffer: Uint8Array;
  respbuffer: Uint8Array;
  state: InternalState;
  commandplace: number;
  prepping_for_erase: number;
  no_get_report: number;
  err_count: number;

  constructor(vendorId: number, productId: number) {
    this.vid = vendorId;
    this.pid = productId;

    this.hd = null;

    this.commandbuffer = new Uint8Array(128).fill(0);
    this.respbuffer = new Uint8Array(128).fill(0);

    this.state = new InternalState();

    this.commandplace = 0;
    this.prepping_for_erase = 0;
    this.no_get_report = 0;
    this.err_count = 0;
  }

  async open() {
    /* based on https://github.com/robatwilliams/webhid-demos/blob/master/blinkstick-strip/script.js */
    const devices = await navigator.hid.getDevices();
    let device = devices.find(
      (d) => d.vendorId === this.vid && d.productId === this.pid,
    );

    if (!!!device) {
      let devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: this.vid, productId: this.pid }],
      });
      device = devices[0];
    }

    if (!!!device) return;

    if (!device.opened) {
      await device.open();
    }

    this.hd = device;
  }

  async init() {
    await this.open();
    if (!!!this.hd) return;
    if (!!!this.hd.opened) return;

    this.commandplace = 1;
  }

  prepForLongOp() {
    this.prepping_for_erase = 1;
    return 0;
  }

  async haltMode(mode: HaltMode) {
    switch (mode) {
      case HaltMode.HaltButNoReset: // Don't reboot.
      case HaltMode.HaltAndReset: // Reboot and halt
        // This programmer is always halted anyway.
        break;
      case HaltMode.Reboot: // Actually boot?
        this.boot();
        break;
      case HaltMode.Resume:
        console.warn("Warning: this programmer cannot resume");
        // We can't do this.
        break;
      case HaltMode.GoToBootloader:
        console.warn(
          "Warning: this programmer is already a bootloader.  Can't go into bootloader",
        );
        break;
    }
    this.state.processor_in_mode = mode;
  }

  async readByte(address: number) {
    return this.readBinaryBlob(address, 1);
  }

  async readHalfWord(address: number) {
    let val = await this.readBinaryBlob(address, 2);

    if (!(val instanceof Uint8Array)) {
      throw Error("Failed reading byte!");
    }

    return ((val[1] << 8) | val[0]) >>> 0;
  }

  // todo: limit data to uint8 anyhow?
  async writeByte(address: number, data: number) {
    return this.internalWriteBinaryBlob(address, 1, new Uint8Array([data]));
  }

  async writeHalfWord(address: number, data: number) {
    return this.internalWriteBinaryBlob(
      address,
      2,
      new Uint8Array([data & 0xff, (data >> 8) & 0xff]),
    ); // todo: check endianess
  }

  async writeWord(address: number, data: number) {
    return this.internalWriteBinaryBlob(
      address,
      4,
      new Uint8Array([
        data & 0xff,
        (data >> 8) & 0xff,
        (data >> 16) & 0xff,
        (data >> 24) & 0xff,
      ]),
    );
  }

  async readWord(address: number) {
    let val = await this.readBinaryBlob(address, 4);

    if (DEBUG_B003) console.log("ReadWord", val);

    if (!(val instanceof Uint8Array)) {
      throw Error("Failed reading word!");
    }

    if (DEBUG_B003) console.log("val", val);

    return ((val[3] << 24) | (val[2] << 16) | (val[1] << 8) | val[0]) >>> 0;
  }

  // needed?
  exit() {
    return 0;
  }

  // ops
  resetOp() {
    this.commandbuffer.fill(0);
    this.commandbuffer[0] = 0xaa;
    this.commandplace = 4;
  }

  writeOp4(opsend: number) {
    let new_end = this.commandplace + 4;
    if (new_end >= this.commandbuffer.length) return;

    this.commandbuffer = arrcpy(
      this.commandbuffer,
      this.commandplace,
      new Uint8Array([
        opsend & 0xff,
        (opsend >> 8) & 0xff,
        (opsend >> 16) & 0xff,
        (opsend >> 24) & 0xff,
      ]),
    );

    this.commandplace = new_end;
  }

  writeOpArb(data: Uint8Array) {
    let new_end = this.commandplace + data.length;
    if (new_end >= this.commandbuffer.length) return;

    this.commandbuffer = arrcpy(this.commandbuffer, this.commandplace, data);
    this.commandplace = new_end;
  }

  async commitOp() {
    let retries = 0;

    this.commandbuffer = arrcpy(
      this.commandbuffer,
      124,
      new Uint8Array([0xcd, 0xab, 0x34, 0x12]),
    ); // "magic_go"

    if (!!!this.hd) return 1;

    if (!this.hd.opened) {
      console.warn("Device not opened");
      await this.hd?.open();
    }

    // resend:
    do {
      try {
        if (DEBUG_B003) {
          console.log("hid sendFeatureReport");
          hexdump(this.commandbuffer);
        }
        let r = await this.hd.sendFeatureReport(
          this.commandbuffer[0],
          this.commandbuffer.slice(1),
        );
        if (DEBUG_B003) console.log("return of sendFeatureReport: ", r);
      } catch (e) {
        console.error("Failed hidSendFeatureReport", e);
        await new Promise((resolve) => setTimeout(resolve, 50)); // delay 5 ms
        continue; // goto resend
      }

      break; // just run once, if everything worked
    } while (++retries < 10);

    if (retries === 10) return 1; // failed

    if (this.no_get_report === 1) return 0; // return r?

    let timeout = 0;
    retries = 0;
    do {
      this.respbuffer[0] = 0xaa;
      try {
        let dv = await this.hd.receiveFeatureReport(this.respbuffer[0]);
        this.respbuffer.fill(0xff);
        this.respbuffer = arrcpy(this.respbuffer, 0, new Uint8Array(dv.buffer));
        if (DEBUG_B003) {
          console.log("HID receiveFeatureReport");
          hexdump(this.respbuffer);
        }
      } catch {
        if (retries++ > 10) return 1;
        continue;
      }

      if (this.respbuffer[1] === 0xff) break;

      if (timeout++ > 20) {
        console.log("Error: Timed out waiting for stub to complete");
        return -99;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (1);
    return 0;
  }

  async internalWriteBinaryBlob(
    address: number,
    size: number,
    blob: Uint8Array,
  ) {
    let is_flash = isAddressFlash(address);

    function verifyfail() {
      console.error(
        "Error: Write Bianry Blob: %d bytes to %08x\n",
        size,
        address,
      );
      return -6;
    }

    if (address & 1 && size > 0) {
      // Need to do byte-wise writing in front to line up with word alignment.
      this.resetOp();
      this.writeOpArb(byte_wise_write_blob);
      this.writeOp4(address); // Base address to write.
      this.writeOp4(1); // write 1 bytes.

      this.commandbuffer = arrcpy(this.commandbuffer, 60, blob, 1);
      if ((await this.commitOp()) !== 0) return -5;
      if (
        is_flash &&
        arrcmp(this.respbuffer.slice(60, this.respbuffer.length), blob, 1) !== 0
      ) {
        return verifyfail();
      }
      blob = blob.slice(1, blob.length); // blob++
      size--;
      address++;
    }
    if (address & 2 && size > 1) {
      // Need to do byte-wise writing in front to line up with word alignment.
      this.resetOp();
      this.writeOpArb(half_wise_write_blob);
      this.writeOp4(address); // Base address to write.
      this.writeOp4(2); // write 2 bytes.

      this.commandbuffer = arrcpy(this.commandbuffer, 60, blob, 2);
      if ((await this.commitOp()) !== 0) return -5;
      if (
        is_flash &&
        arrcmp(this.respbuffer.slice(60, this.respbuffer.length), blob, 2) !== 0
      ) {
        return verifyfail();
      }
      blob = blob.slice(2, blob.length);
      size -= 2;
      address += 2;
    }
    while (size > 3) {
      let to_write_this_time = size & 0xfffffffc; // 0xf..fc == ~3
      if (to_write_this_time > 64) to_write_this_time = 64;

      // Need to do byte-wise writing in front to line up with word alignment.
      this.resetOp();
      this.writeOpArb(word_wise_write_blob);
      this.writeOp4(address); // Base address to write.
      this.writeOp4(to_write_this_time); // write 4 bytes.
      this.commandbuffer = arrcpy(
        this.commandbuffer,
        60,
        blob,
        to_write_this_time,
      );
      if ((await this.commitOp()) !== 0) return -5;
      if (
        is_flash &&
        arrcmp(
          this.respbuffer.slice(60, this.respbuffer.length),
          blob,
          to_write_this_time,
        )
      ) {
        return verifyfail();
      }
      blob = blob.slice(to_write_this_time, blob.length);
      size -= to_write_this_time;
      address += to_write_this_time;
    }
    if (size > 1) {
      this.resetOp();
      this.writeOpArb(half_wise_write_blob);
      this.writeOp4(address);
      this.writeOp4(2); // size
      this.commandbuffer = arrcpy(this.commandbuffer, 60, blob, 2);
      if ((await this.commitOp()) !== 0) return -5;
      if (is_flash && arrcmp(this.respbuffer, blob, 1)) return verifyfail();
      blob = blob.slice(2, blob.length);
      size -= 2;
      address += 2;
    }
    if (size > 0) {
      this.resetOp();
      this.writeOpArb(byte_wise_write_blob);
      this.writeOp4(address);
      this.writeOp4(1); // size
      this.commandbuffer = arrcpy(this.commandbuffer, 60, blob, 1);
      if ((await this.commitOp()) !== 0) return -5;
      if (is_flash && arrcmp(this.respbuffer, blob, 1)) return verifyfail();
      blob = blob.slice(1, blob.length);
      size -= 1;
      address += 1;
    }
    this.prepping_for_erase = 0;
    console.log(".");
    return 0;
  }

  async readBinaryBlob(address: number, size: number) {
    let blob: Uint8Array = new Uint8Array(128).fill(0);
    let bloboffset = 0;

    if (address & 0x1 && size > 0) {
      this.resetOp();
      this.writeOpArb(byte_wise_read_blob);
      this.writeOp4(address);
      this.writeOp4(1);
      if ((await this.commitOp()) !== 0) return -5;
      blob = arrcpy(blob, bloboffset, this.respbuffer.slice(60), 1);
      bloboffset++;
      size--;
      address++;
    }
    if (address & 0x2 && size > 1) {
      this.resetOp();
      this.writeOpArb(half_wise_read_blob);
      this.writeOp4(address);
      this.writeOp4(2);
      if ((await this.commitOp()) !== 0) return -5;
      blob = arrcpy(blob, bloboffset, this.respbuffer.slice(60), 2);
      bloboffset += 2;
      size -= 2;
      address += 2;
    }
    while (size > 3) {
      let to_read_this_time = size & 0xfffffffc;
      if (to_read_this_time > 64) to_read_this_time = 64;

      // Need to do byte-wise reading in front to line up with word alignment.
      this.resetOp();
      this.writeOpArb(word_wise_read_blob);
      this.writeOp4(address); // Base address to read.
      this.writeOp4(to_read_this_time); // Read 4 bytes.
      if ((await this.commitOp()) !== 0) return -5;
      blob = arrcpy(
        blob,
        bloboffset,
        this.respbuffer.slice(60),
        to_read_this_time,
      );
      bloboffset += to_read_this_time;
      size -= to_read_this_time;
      address += to_read_this_time;
    }
    if (size > 1) {
      this.resetOp();
      this.writeOpArb(half_wise_read_blob);
      this.writeOp4(address);
      this.writeOp4(2);
      if ((await this.commitOp()) !== 0) return -5;
      blob = arrcpy(blob, bloboffset, this.respbuffer.slice(60), 2);
      bloboffset += 2;
      size -= 2;
      address += 2;
    }
    if (size > 0) {
      this.resetOp();
      this.writeOpArb(byte_wise_read_blob);
      this.writeOp4(address);
      this.writeOp4(1);
      if ((await this.commitOp()) !== 0) return -5;
      blob = arrcpy(blob, bloboffset, this.respbuffer.slice(60), 2);
      bloboffset++;
      size--;
      address++;
    }

    return blob;
  }

  async isMemoryErased(address: number) {
    if ((address & 0xff000000) !== 0x08000000) return 0;
    let sector = (address & 0xffffff) / this.state.sector_size;
    if (sector >= MAX_FLASH_SECTORS) return 0;
    else return this.state.flash_sector_status[sector];
  }

  async unlockFlash() {
    let ret = 0;
    function reterr() {
      console.error(
        "Error unlocking flash, got code %d from underlying system",
        ret,
      );
      return ret;
    }

    let rw = await this.readWord(0x40022010); // FLASH->CTLR
    if (rw & 0x8080) {
      ret = await this.writeWord(0x40022004, 0x45670123); // FLASH->KEYR = 0x40022004
      if (ret !== 0) return reterr();
      ret = await this.writeWord(0x40022004, 0xcdef89ab);
      if (ret !== 0) return reterr();
      ret = await this.writeWord(0x40022008, 0x45670123); // OBKEYR = 0x40022008  // For user word unlocking
      if (ret !== 0) return reterr();
      ret = await this.writeWord(0x40022008, 0xcdef89ab);
      if (ret !== 0) return reterr();
      ret = await this.writeWord(0x40022024, 0x45670123); // MODEKEYR = 0x40022024
      if (ret !== 0) return reterr();
      ret = await this.writeWord(0x40022024, 0xcdef89ab);
      if (ret !== 0) return reterr();

      rw = await this.readWord(0x40022010); // FLASH->CTLR = 0x40022010

      if (rw & 0x8080) {
        console.error("Error: Flash is not unlocked (CTLR = %d)", rw);
        return -9;
      }
    }

    rw = await this.readWord(0x4002201c); //(FLASH_OBTKEYR)
    if (rw & 2) {
      console.warn(
        "WARNING: Your part appears to have flash [read] locked.  Cannot program unless unlocked.\n",
      );
    }

    this.state.flash_unlocked = 1;
    return 0;
  }

  async erase(address: number, length: number) {
    function flashoperr() {
      console.error("Flash operation error!");
      return -93;
    }

    if (this.state.flash_unlocked === 0) {
      let rw = await this.unlockFlash();
      if (rw !== 0) return rw;
    }

    let chunk_to_erase = address;
    chunk_to_erase = chunk_to_erase & (~(this.state.sector_size - 1) >>> 0);
    while (chunk_to_erase < address + length) {
      if ((chunk_to_erase & 0xff000000) === 0x08000000) {
        let sector = Math.floor(
          (chunk_to_erase & 0x00ffffff) / this.state.sector_size,
        );
        if (sector < MAX_FLASH_SECTORS)
          this.state.flash_sector_status[sector] = 1;
      }

      // Step 4:  set PAGE_ER of FLASH_CTLR(0x40022010)
      if ((await this.writeWord(0x40022010, 0x00020000)) !== 0)
        // 0x00020000 = CR_PAGE_ER
        return flashoperr(); // CR_PAGE_ER is FTER

      // Step 5: Write the first address of the fast erase page to the FLASH_ADDR register.
      if ((await this.writeWord(0x40022014, chunk_to_erase)) !== 0)
        return flashoperr();
      this.prepForLongOp();

      // Step 6: Set the STAT/STRT bit of FLASH_CTLR register to '1' to initiate a fast page erase (64 bytes) action.
      if (
        (await this.writeWord(0x40022010, ((1 << 6) | 0x00020000) >>> 0)) !== 0
      )
        // 0x00020000 = CR_PAGE_ER
        return flashoperr();

      //if( MCF.WaitForFlash && MCF.WaitForFlash( dev ) ) return -99; // todo???

      chunk_to_erase += this.state.sector_size;
    }
    return 0;
  }

  async blockWrite64(address: number, data: Uint8Array) {
    if (data.length < 64) return -1;
    if (isAddressFlash(address)) {
      if (!this.state.flash_unlocked) {
        let rw = await this.unlockFlash();
        if (rw !== 0) return rw;
      }
      if (!(await this.isMemoryErased(address))) {
        let e = await this.erase(address, 64);
        if (e !== 0) {
          console.error("Error: Failed to erase sector at %d", address, e);
          return -9;
        }
      }

      // not actually needed???
      await this.writeWord(0x40022010, 0x00010000); // (intptr_t)&FLASH->CTLR = 0x40022010
      await this.writeWord(0x40022010, 0x00010000 | 0x00080000); // (intptr_t)&FLASH->CTLR = 0x40022010

      this.resetOp();
      this.writeOpArb(write64_flash);
      this.writeOp4(address); // Base address to write. @52
      this.writeOp4(0x4002200c); // FLASH STATR base address. @ 56
      this.commandbuffer = arrcpy(this.commandbuffer, 60, data, 64);
      this.prepForLongOp();
      if ((await this.commitOp()) !== 0) return -5;
    } else {
      return this.internalWriteBinaryBlob(address, 64, data);
    }
    return 0;
  }

  async writeBinaryBlob(address: number, size: number, blob: Uint8Array) {
    let rw = 0;
    if (address < 0x01000000) address |= 0x08000000;

    let is_flash = isAddressFlash(address);

    if (size === 0 || blob.length === 0) return 0;

    if (is_flash && this.state.flash_unlocked !== 0) {
      rw = await this.unlockFlash();
      if (rw !== 0) return rw;
    }

    if (address > 0x1ffff7c0 && address < 0x20000000) {
      throw new Error("Not implemented");
    }

    let sector_size = this.state.sector_size;
    let blocks_per_sector = sector_size / 64;
    let sector_size_mask = sector_size - 1;

    // address/size is 64-aligned
    if (
      is_flash &&
      (address & sector_size_mask) === 0 &&
      (size & sector_size_mask) === 0
    ) {
      for (let i = 0; i < size; ) {
        for (let j = 0; j < blocks_per_sector; j++) {
          let r = await this.blockWrite64(address + i, blob.slice(i));
          i += 64;
          if (r !== 0) {
            console.error(
              "Error writing block at memory %08x / Error: %d\n",
              address,
              r,
            );
          }
        }
      }
      return 0;
    }

    let tmp_block: Uint8Array = new Uint8Array(sector_size).fill(0);
    let sblock = Math.floor(address / sector_size);
    let eblock = Math.floor((address + size + (sector_size - 1)) / sector_size);
    let b = 0;
    let rsofar = 0;

    for (b = sblock; b < eblock; b++) {
      let offset_in_block = address - b * sector_size;
      if (offset_in_block < 0) offset_in_block = 0;
      let end_o_plus_one_in_block = address + size - b * sector_size;
      if (end_o_plus_one_in_block > sector_size)
        end_o_plus_one_in_block = sector_size;
      let base = b * sector_size;

      if (offset_in_block === 0 && end_o_plus_one_in_block === sector_size) {
        for (let i = 0; i < sector_size / 64; i++) {
          let r = await this.blockWrite64(
            base + i * 64,
            blob.slice(rsofar + i * 64),
          );
          if (r !== 0) {
            console.log(
              "Error writing block at memory %08x (error = %d)",
              base,
              r,
            );
            return r;
          }
        }
        rsofar += sector_size;
      } else {
        // "Ok, we have to do something wacky." - minichlink.c:1707
        if (is_flash) {
          let r = await this.readBinaryBlob(base, sector_size);
          if (!(r instanceof Uint8Array)) return r;
          tmp_block = arrcpy(tmp_block, 0, r);

          let tocopy = end_o_plus_one_in_block - offset_in_block;
          tmp_block = arrcpy(
            tmp_block,
            offset_in_block,
            blob.slice(rsofar),
            tocopy,
          );
          rsofar += tocopy;

          for (let i = 0; i < sector_size / 64; i++) {
            r = await this.blockWrite64(base + i * 64, tmp_block.slice(i * 64));
            if (r !== 0) return r;
          }
        } else {
          throw new Error("Not implemented !is_flash");
        }
      }
    }
    return 0;
  }

  async boot() {
    console.log("Booting");
    this.resetOp();
    this.writeOpArb(run_app_blob);
    this.no_get_report = 1;
    if ((await this.commitOp()) !== 0) return -5;
    return 0;
  }

  async setupInterface() {
    console.log("Halting Boot Countdown\n");
    this.resetOp();
    this.writeOpArb(halt_wait_blob);
    if ((await this.commitOp()) !== 0) return -5;
    return 0;
  }

  /* High'er level functions */
  async getChipInfo() {
    this.haltMode(HaltMode.HaltButNoReset);

    let user_rdpr = await this.readWord(0x1ffff800);
    let data1_data0 = await this.readWord(0x1ffff804);
    let wrpr1_wrpr0 = await this.readWord(0x1ffff808);
    let wrpr3_wrpr2 = await this.readWord(0x1ffff80c);
    let flash_size = await this.readWord(0x1ffff7e0);
    let r32_esig_uniid1 = await this.readWord(0x1ffff7e8);
    let r32_esig_uniid2 = await this.readWord(0x1ffff7ec);
    let r32_esig_uniid3 = await this.readWord(0x1ffff7f0);

    let info = {
      USER: (user_rdpr >> 16) & 0xffff,
      RDPR: user_rdpr & 0xffff,
      DATA1: (data1_data0 >> 16) & 0xffff,
      DATA0: data1_data0 & 0xffff,
      WRPR1: (wrpr1_wrpr0 >> 16) & 0xffff,
      WRPR0: wrpr1_wrpr0 & 0xffff,
      WRPR3: (wrpr3_wrpr2 >> 16) & 0xffff,
      WRPR2: wrpr3_wrpr2 & 0xffff,
      flash_size: flash_size & 0xffff,
      R32_ESIG_UNIID1: r32_esig_uniid1,
      R32_ESIG_UNIID2: r32_esig_uniid2,
      R32_ESIG_UNIID3: r32_esig_uniid3,
    };
    return info;
  }

  async writeImage(data: Uint8Array, offset: number) {
    if (!isAddressFlash(offset)) {
      console.log("Invalid offset address");
      return 1;
    }

    if (offset === 0x1ffff000) {
      // do not reset if writing bootloader, even if it is considered flash memory
      await this.haltMode(HaltMode.HaltButNoReset);
    } else {
      await this.haltMode(HaltMode.HaltAndReset);
    }

    console.log(
      "Writing image %d bytes @ 0x",
      data.length,
      offset.toString(16),
    );
    return await this.writeBinaryBlob(offset, data.length, data);
  }
}

export { B003Device, HaltMode };
