# ESP32 Pin Lab

A static, browser-based wiring playground for a 60-column A–J breadboard and a common 30-pin ESP32 DevKit V1. Hosted at https://experiments.maiyoinstitute.org/esp32/ with a card on the experiments homepage.

## Run and check

```sh
npm ci
npm run dev
npm test
npm run build
```

Node 22.13+ is required. Vite serves the local app at http://127.0.0.1:5173. The production output is `dist/`; it needs only a static web server. All simulation and browser-local saving happens on the client. There is no backend process, database, or paid API.

## Workbench

- Drag components from the starter kit, or select one and click an anchor hole. Drag placed parts to move them; rotate with R. Precise placement and move forms offer keyboard alternatives.
- W selects the jumper tool. Click two holes, including directly on labeled ESP32 pins. V selects parts/wires; I inspects connected holes. Delete removes; Ctrl/Cmd Z undoes. Wires remain in the same holes when parts move.
- Power is disconnected on circuit edits. USB power energizes 3V3. The ESP32 inspector controls GPIO23 HIGH/LOW; other GPIOs are inputs. VIN is not a supply in this preview.
- Choose resistor values, hold a push button, or adjust a photoresistor's light level in the inspector.
- Four challenges cover breadboard strips, an LED with a resistor, a button, and a GPIO34 light-sensor divider. Load example provides a working reference circuit.
- Projects and progress save locally in the browser; JSON export/import allows manual transfer. Clear board is undoable.

## Model and limits

`lib/circuit.ts` builds electrical nets from A–E/F–J strips, independent power rails, jumper wires, and button contacts. Rail splits at columns 30/31 are configurable. Resistor paths are evaluated by minimum path resistance; LEDs require correct polarity and 100 Ω–10 kΩ series resistance. Shorts below 100 Ω between active supplies and ground pause the power preview. Sensor readings estimate a single voltage divider.

This is a connectivity teaching model, not SPICE or an ESP32 emulator. Parallel resistor networks, shared-load currents, several LEDs in series, firmware, timing, PWM, actual brightness/sound, and multi-pin sensor modules are not simulated. The buzzer has a visual active indication only. A photoresistor's modeled range is 500 Ω–50 kΩ.

The default DevKit is drawn sideways, USB left, VIN at the upper-left header and 3V3 at the lower-left. Its two 15-pin headers have a 10-hole spacing. Clone dimensions and pinouts vary. The transparent board option teaches connections beneath the body; it does not guarantee physical component clearance. Wide ESP32 boards may need an adapter or off-board jumper leads. Virtual wires can connect directly to labeled pins. Check the markings on the physical board before copying a circuit.

References: [SparkFun breadboards](https://learn.sparkfun.com/tutorials/how-to-use-a-breadboard/all), [Espressif ESP32 datasheet](https://documentation.espressif.com/esp32_datasheet_en.html), and [30-pin DevKit V1 pin layout](https://github.com/playelek/pinout-doit-32devkitv1).

## Deploy to the free VM

```sh
./scripts/deploy_free_vm.sh
```

The script runs tests and a production build locally, uploads only static build output, and invokes `scripts/install_remote.py` via GCP IAP. Target: `voltus-free-vm`, zone `us-central1-a`, project `gen-lang-client-0437984435`.

The installer creates a timestamped release under `/var/www/esp32-releases/`, atomically activates `/var/www/esp32-current`, adds an Nginx `/esp32/` alias, and adds one card to `/var/www/voltus-gateway/index.html`. It copies the existing `/voltus/` allow/deny policy, keeps Cloudflare Access unchanged, backs up the Nginx config and gateway to `/var/backups/esp32-pin-lab/<timestamp>/`, checks `nginx -t`, and reloads Nginx. On validation/reload failure it restores the prior config, homepage, and release symlink when one existed. Releases and backups are retained.

For a later release rollback, point `/var/www/esp32-current` at the recorded previous release. The backup directory contains `previous-release.txt`, `nginx.bak`, and `gateway.bak`; restore config/homepage only when needed, and check newer unrelated edits before replacing either. Run `nginx -t` before reloading.

The generated Sites component catalog is retained for reuse, but this project's explicit deployment target is the existing VM. The build is plain Vite static output; there is no Sites registration or Cloudflare Worker runtime.

## Verification

`npm test` covers strip/rail connectivity, LED polarity and protection, direct shorts, switched contacts, light-divider readings, GPIO23, placement, rotation, import validation, and user flows with React Testing Library in jsdom. It also checks the feature-detected WebMCP inspection/replacement contract with a mock registry. Real browser WebMCP integration and visual browser QA are separate from these tests.

## Placement fixes and physical-circuit reference (September 2026)

Drag a kit card with a mouse or finger to place that component; a snapped ghost follows the pointer and clicking a card still enables precise click-to-place. Drag a specific leg to snap that leg to the target hole. Click a pin in the inspector, then use **Move to a hole** above the board for a click-to-place alternative. Arrow keys move the selected leg by one hole, including across E/F. Target rings show pin addresses before placement. In Select mode, drag a jumper wire by its middle to move both ends together, or drag either round endpoint to reconnect that end. The preview labels show the target holes. Invalid drops keep the original wire; Escape cancels a drag. Both endpoints also retain move controls and an exact-address form. Zoom now uses actual board pixels (100% = 20px hole spacing) and Fit remains available.

A drag renders the existing component once, retaining its LED state. The final pointer-up coordinate determines the drop; a drop or exact move into unchanged holes creates no undo step and does not disconnect power. Actual circuit edits still disconnect USB power. Wires remain in their original holes.

**Load my wiring** reads the reference documented in `/Users/brian/Developer/MRI/electronics/esp32_device/README.md` and `src/main.cpp`: GPIO23 is an active-low pull-up input at B42, the button's other side is grounded at B40, GPIO19 feeds the red LED anode, its cathode returns through 220 Ω to ground, and GPIO2 mirrors the output. Other placement coordinates are illustrative. The preset uses the button's same-side contact orientation; the original across-gap button remains available in the normal kit.

The provided firmware cycles Off / Solid / Strobe / Heartbeat on debounced presses (40 ms). Strobe toggles every 80 ms; heartbeat is HIGH at 0–100 and 200–300 ms of each 1 s cycle. The virtual hardware preset deliberately uses steady manual GPIO19/GPIO2 output, not firmware emulation. Hardware files, firmware and the physical ESP32 were not changed.
