# CLAUDE.md — Reglas duras de este repo (Bangle.js 2)

Fork de `espruino/BangleApps`. Target: **Bangle.js 2, 176x176, 8 colores**.
No hay compilación: JavaScript de Espruino subido tal cual.

El CI es `npm test` = `bin/sanitycheck.js` + `eslint --max-warnings 0 ./apps` +
`eslint --max-warnings 0 ./modules`. **Cualquier warning rompe el build**, y con
la variable de entorno `CI` presente los warnings de `sanitycheck.js` también
provocan `exit 1`. En local no: verifica siempre con `CI=true node bin/sanitycheck.js`.

---

## 1. Globals: whitelist cerrada

`no-undef` está en `warn`, y con `--max-warnings 0` eso es un fallo. Solo existe
lo que esté en `globals` de `.eslintrc.js`.

**Permitidos** (lista útil, no exhaustiva — la fuente es `.eslintrc.js`):

- Objetos Bangle/Espruino: `Bangle`, `g`, `E`, `NRF`, `Graphics`, `WIDGETS`,
  `Modules`, `Flash`, `StorageFile`, `Waveform`, `Unistroke`, `Serial1`,
  `I2C1`, `SPI1`, `Bluetooth`, `BluetoothDevice`, `TFMicroInterpreter`
- Módulos: `require`, `module`, `exports` (`exports` es `writable`)
- Tiempo: `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`,
  `changeInterval`, `setWatch`, `clearWatch`, `getTime`, `setTime`, `Date`
- Sistema: `load`, `save`, `reset`, `print`, `eval`, `console`, `process`,
  `global`, `globalThis`, `__FILE__`, `dump`, `trace`, `edit`
- Datos: `atob`, `btoa`, `JSON`, `Math`, `Promise`, `ArrayBuffer`, `DataView`,
  typed arrays (incluido `Uint24Array`), `encodeURIComponent`, `decodeURIComponent`
- Hardware: `D0`–`D31`, `BTN`, `BTN1`–`BTN5`, `LED`, `LED1`, `LED2`, `VIBRATE`,
  `HIGH`, `LOW`, `digitalRead`, `digitalWrite`, `digitalPulse`, `analogRead`,
  `analogWrite`, `pinMode`, `getPinMode`, `peek8/16/32`, `poke8/16/32`

**Prohibidos — rompen el lint:**

| Prohibido | Por qué / alternativa |
|---|---|
| `window`, `document`, `localStorage` | no es un navegador |
| `fetch`, `XMLHttpRequest` | no existe |
| `Buffer` | es de Node; usa `Uint8Array` / `E.toArrayBuffer` |
| `Map`, `Set`, `WeakMap`, `WeakSet`, `Proxy`, `Symbol` | no están en la whitelist |
| `setImmediate` | usa `setTimeout(fn, 0)` |
| `Storage` como global | **siempre** `require("Storage")` |
| `import` / `export` (ESM) | no hay `sourceType: module`: ni siquiera parsea |

## 2. ES2022 pasa el lint, pero el firmware no lo ejecuta

`parserOptions.ecmaVersion: 2022`. eslint acepta clases, `async/await`,
optional chaining, spread, destructuring… **El CI no valida el runtime de
Espruino.** Que compile aquí no significa que corra en el reloj.

Escribe **subset conservador**: `var`/`let`/`const`, funciones normales y arrow,
objetos y arrays planos, `for`/`while`. Nada exótico sin comprobarlo.
La verificación real es el emulador del App Loader o el reloj, nunca el CI.

Reglas activas que además fallan: `no-unused-vars` (los argumentos sí se
perdonan: `args: "none"`), `no-unreachable`, `no-cond-assign`, `no-useless-catch`,
`no-empty` (permite `catch` vacío).

> `apps/lint_exemptions.js` **no es una salida**. Las exenciones van con hash
> SHA-256 y se autoborran al editar el fichero; están reservadas a apps
> preexistentes cuando se añade una regla nueva.

## 3. `metadata.json`: lo que rompe el CI

**Obligatorios**: `id`, `name`, `version`, `author`, `description`, `icon`,
`supports` (array), `storage`.

**Claves válidas** (cualquier otra es ERROR):
`id`, `name`, `shortName`, `version`, `icon`, `screenshots`, `description`,
`tags`, `type`, `sortorder`, `readme`, `custom`, `customConnect`, `interface`,
`storage`, `data`, `supports`, `allow_emulator`, `dependencies`,
`provides_modules`, `provides_widgets`, `provides_features`, `default`,
`author`, `requires_firmware`.

- `storage[]` admite: `name`, `url`, `content`, `evaluate`, `supports`, `noOverwrite`
- `data[]` admite: `name`, `wildcard`, `storageFile`, `url`, `content`, `evaluate`
- `supports` solo: `BANGLEJS`, `BANGLEJS2`, `BANGLEJS3`, `BANGLEJS3_COMPAT`
- `type` solo: `app`, `clock`, `widget`, `bootloader`, `RAM`, `launch`,
  `scheduler`, `notify`, `locale`, `settings`, `textinput`, `module`,
  `clkinfo`, `defaultconfig`

**Reglas que muerden:**

- **ChangeLog**: fichero llamado exactamente `ChangeLog` (sin extensión). Su
  última entrada `\d+\.\d+:` debe **coincidir exactamente** con `version`. Sin
  ChangeLog y con `version != "0.01"` → WARN → falla en CI.
- **README**: si hay un `README.md` en el directorio, `metadata.json` **debe**
  declarar `"readme": "README.md"`. Tenerlo sin declarar es ERROR.
- **tags**: minúsculas, separados por comas, **sin espacios** alrededor.
  `"clock,tool"` sí; `"Clock, tool"` no.
- **Nombres de fichero** (`storage` y `data`): máximo **28 caracteres**,
  prohibidos `,` y `;`, sin comodines en `storage`. No pueden colisionar con
  ficheros de otra app.
- **`name` de más de 20 caracteres exige `shortName`.**
- **Settings**: `<id>.settings.json` y `<id>.json` van en `"data"`, **nunca** en
  `"storage"`. Si añades `<id>.settings.js` a storage, declara la entrada
  correspondiente en `data` o salta WARN.
- **Dependencias**: si el código usa `clock_info` o `clockbg`, hay que
  declararlo en `"dependencies"` o es ERROR.
- **`"allow_emulator": true` siempre.** Sin él no aparece el botón de emulador
  en el App Loader, que es el ciclo de prueba rápida.

## 4. Icono `<id>.img`

Entrada en `storage` con `"evaluate": true`, y el contenido debe casar uno de
estos patrones **exactos**:

```js
require("heatshrink").decompress(atob("...")) 
atob("...")
E.toArrayBuffer(atob("..."))
```

Tamaño **entre 24x24 y 48x48 px**. Fuera de rango es ERROR.
Genera el icono con https://www.espruino.com/Image+Converter (1 bit, salida
"Image String", compresión heatshrink).

## 5. Orden en un clock (`type: "clock"`)

La regla **dura** del CI: `Bangle.setUI(` debe aparecer **antes** que
`Bangle.loadWidgets()`. `sanitycheck.js` compara la posición de ambas cadenas
en el fichero; al revés es WARN → **falla el CI**, y además el widget de reloj
no se entera de que hay un clock corriendo.

Orden recomendado:

```js
g.clear();
Bangle.setUI({mode:"clock", remove: ...});  // 1. antes que loadWidgets
Bangle.loadWidgets();                       // 2.
draw();                                     // 3. después: appRect ya es correcto
Bangle.drawWidgets();                       // 4.
```

**`Bangle.appRect` solo excluye la franja de widgets después de
`Bangle.loadWidgets()`.** Si pintas antes usando `appRect`, el primer frame
ocupa la pantalla entera y queda basura bajo los widgets hasta el siguiente
redibujado. `apps/_example_clock` sí pinta antes de `loadWidgets`, pero puede
permitírselo porque limpia con coordenadas absolutas en vez de `appRect`.
`apps/antonclk` usa el orden de arriba; `apps/nrkclk` también.

Incluye siempre `remove:` en `setUI` para liberar timers (fast load).

## 6. `apps.json` y GitHub Pages

- **Nunca commitees `apps.json`.** El versionado es una plantilla Liquid con
  front matter `---`, no datos. `bin/create_apps_json.sh` sin argumentos hace
  `git update-index --skip-worktree apps.json` justo para evitar el accidente.
- En **GitHub Pages se genera solo** vía Jekyll en cada push. Requiere que Pages
  esté configurado en **"Deploy from a branch"** (build Jekyll clásico). Si está
  en modo "GitHub Actions / static HTML", Jekyll no corre y el loader muestra
  el toast *"apps.json still contains Jekyll markup"*.
- Para servir en local: `npm run update-local-apps` genera `apps.local.json`
  (ignorado por git), que es lo que carga el loader en `localhost`.
- Los directorios `apps/_example*` quedan fuera de `apps.json`, de
  `sanitycheck.js` y del escaneo del loader — pero **sí pasan por eslint**.

## 7. Antes de dar nada por bueno

```bash
CI=true node bin/sanitycheck.js
npx eslint --max-warnings 0 ./apps
```

Baseline limpio del repo: `0 errors, 0 warnings`. Si tu cambio añade uno, es tuyo.

Ojo: `npm test` corre `bin/sync-lint-exemptions.mjs`, que **modifica**
`apps/lint_exemptions.js` borrando la exención de `apps/keytimer/common.js`
(su hash no cuadra ya en upstream). Es un desajuste heredado, no tuyo:
`git checkout -- apps/lint_exemptions.js` después de cada `npm test`, y nunca
lo incluyas en un commit.

## 8. Scaffolding

No copies las plantillas a mano. Usa:

```bash
node bin/new_bangle_app.mjs --id miclock --name "Mi Clock" --type clock --author <usuario>
```

Genera `apps/<id>/` desde `_example_clock`/`_example_app`/`_example_widget` con
`version` 0.01, ChangeLog coherente, `allow_emulator`, `supports:["BANGLEJS2"]`
y `readme` ya puestos, y valida id, longitudes y `shortName` antes de escribir
nada. Sin argumentos pregunta de forma interactiva.
