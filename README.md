# CH32WebFlash

Every wanted to flash bare-metal hardware directly from your Browser? I mean what could possibly go wrong?
So this is for you!

CH32WebFlash allows you to flash firmware to CH32V003 microcontrollers (running the [rv003usb](https://github.com/cnlohr/rv003usb) bootloader) directly from your browser.

## It's a prototype

Currently it only is able to flash binary images to CH32V003 chips, the code is ported from minichlink, so it should be easily doable to port all functions from it, but for now I just wanted to be able to flash images.

## How To

Connect to the device

```ts
let device = new B003Device(0x1209, 0xb003);
await device.init();

if (!!!device || !!!device.hd) {
  console.log("Failed opening device");
}

let result = await device.setupInterface();
console.log("Setup interface", result);

if (result !== 0) {
  console.error("Failed setting up interface");
}
```

Get chip info

```ts
let info = await device.getChipInfo();
console.log("Chip info", info);
```

Flash image

```ts
// open a .bin file first
const image = new Uint8Array(await file.arrayBuffer());
let r = await device.writeImage(image, 0x08000000);
if (r !== 0) {
  console.error(`Failed writing image (${r})`);
}
```

Boot the device after flashing

```ts
let r = await device.boot();
if (r !== 0) {
  console.error(`Failed booting (${r})... please reset the device`);
}
```

## License / License Notes

This project is licensed under MIT License and is based on code by CNLohr (https://github.com/cnlohr/ch32fun) which also is licensed under MIT License.
