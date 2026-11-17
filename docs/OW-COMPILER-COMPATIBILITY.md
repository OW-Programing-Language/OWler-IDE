# OWler IDE and the current OW compiler

OWler pins an exact source commit of the [OW compiler](https://github.com/OW-Programing-Language/ow-lang)
when packaging installers. See `scripts/bundle-ow.mjs` for the default revision.
To test another compiler during development, set `OWLER_OW_BIN`; during bundling
use `OW_REF`. An older compiler cannot understand newly introduced syntax.

## Editor syntax and commands

The **preferred YAML-style function signature** is:

```ow
fn greet(name: string):
  returns: string
  return: "Hello " + name
```

- `name: type` declares a typed argument; `returns: type` declares the
  return type at the beginning of a function/method body.
- `return:` is the executable return statement, different from `returns:`.
- The old `fn greet(name string) -> string:` remains valid.
- Monaco provides YAML function snippets, hover documentation, contextual
  type completions and an **opt-in quick fix** converting compatible legacy
  `fn` header lines to YAML-style declarations.
- The explorer already supports right-click **Reload Dependencies** on a
  project-root `dependencies.yml`.
- **Run OW** uses the JVM-hosted interpreter; **Build** invokes the current
  native compiler; **LLVM IR** runs `ow llvm` and saves `.ll` files under
  `build/owler/<relative-source>.ll` in the project.
- OWUnit test gutter icons, single-test filters, full test explorer, and
  `@Test` / `@BeforeEach` / `@AfterEach` are already integrated.

## Compiler feature matrix

| Feature | `ow run` interpreter | Experimental `ow build` / `ow llvm` |
|---|---|---|
| YAML-style `name: type` / `returns: type` | Yes | Yes |
| `@Test` and `ow test` with hooks | Yes | Not supported as native tests |
| `throw`, `try`, `catch`, `finally` | Yes | Not yet supported |
| Integer arrays and `array(count, fill)` | Yes | Yes (i32 elements) |
| Array aliases, indexed updates and memory cleanup | Yes | Yes (reference counting) |
| Typed array function parameters and returns | Yes | Yes (annotated) |
| UTF-8 string literals, comparison, `len` | Yes | Yes |
| Native `string + string` and memory cleanup | Yes | Yes |
| Mixed string/number concatenation | Yes | Not yet supported |
| String arrays, dictionaries, class/object features | Yes | Not yet fully supported |
| Static module calculus and supported functors | Yes | Partial native lowering |
| Night web routes / GUI runtime | Yes | Packaged runtime, not native LLVM |

**Important:** `ow build` generates native executables **only for the
currently supported subset**. Owler does not treat a successful JVM run as proof
that native compilation will work. `ow package --type web` bundles an OW
runtime; it is not a fully native LLVM web executable.

## New-project files

- `src/main.ow`: tiny YAML-style Hello World program.
- `examples/native-features.ow`: an interpreter/native compatible example
  of arrays, function calls and dynamic Unicode strings.
- `tests/ExampleTest.ow`: OWUnit starter.
- `dependencies.yml`: pinned dependencies for the project.

Run the native example using **Build** or **LLVM IR** while the example tab is
open, or execute from a terminal:

```sh
ow check examples/native-features.ow
ow run examples/native-features.ow
ow llvm examples/native-features.ow build/native-features.ll
ow build examples/native-features.ow
ow test tests/
```

The bundled Java toolchain is still needed **at compile time**, but a
successfully compiled native program does not need the JVM **at runtime**.
