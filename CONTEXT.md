# PicGo-Core

Headless image-upload runtime shared between the PicGo CLI and the PicGo GUI. Owns the plugin loader, config schema, uploader/transformer registry, and lifecycle hooks.

## Language

**Plugin Config Schema**:
The array of field descriptors a plugin returns from `config(ctx)` — the contract that drives both inquirer prompts in CLI and the rendered form in GUI.
_Avoid_: "form schema" (too generic), "prompts" (CLI-only flavor)

**Plugin Config Field**:
One descriptor in the Plugin Config Schema (`IPluginConfig`), identified by its `name`. Has a `type`, optional `choices`, `default`, and `dependsOn`.
_Avoid_: "prompt", "form field" (use the canonical term)

**dependsOn**:
Optional `string[]` on a Plugin Config Field listing the `name`s of other fields whose value changes should cause this field's `choices`/`default` to be re-evaluated. Opt-in; absence means the field is static.
_Avoid_: "refreshOn", "watch", "deps"

**Reactive Field**:
A Plugin Config Field that declares `dependsOn` — its `choices` and/or `default` are expected to be functions and will be re-evaluated against the latest draft values.
_Avoid_: "dynamic field", "live field"

**Draft Values**:
A snapshot of all field values currently displayed in the GUI plugin-config form — initialized from stored config plus schema defaults at form open, then layered with the user's unsaved edits. Passed verbatim as the `answers` argument to reactive `choices(answers)`/`default(answers)`. In CLI, the analogous concept is inquirer's accumulated `answers`.
_Avoid_: "form state", "pending config", "draft only" (the snapshot is not just user edits — it includes stored values for untouched fields)

**handleConfigWithFunction**:
The serialization step (lives in PicGo GUI's main process today) that resolves function-typed `choices`/`default` in a Plugin Config Schema before sending it over IPC to the renderer.

## Relationships

- A **Plugin Config Schema** contains one or more **Plugin Config Fields**.
- A **Plugin Config Field** with **dependsOn** is a **Reactive Field**.
- **Reactive Fields** are re-evaluated by passing the current **Draft Values** as `answers` to their `choices`/`default` functions.
- In CLI, inquirer drives Reactive Fields directly via accumulated `answers`; in GUI, **handleConfigWithFunction** is invoked again with Draft Values and produces a fresh Plugin Config Schema for the renderer.

## Example dialogue

> **Plugin author:** "I want the second dropdown's options to depend on the first dropdown."
> **Maintainer:** "Add `dependsOn: ['firstField']` to the second **Plugin Config Field** and make its `choices` a function. CLI works automatically via inquirer; GUI will pass **Draft Values** as `answers` whenever `firstField` changes."

## Flagged ambiguities

- "config" was overloaded between the saved persisted config (`ctx.getConfig()`) and the in-progress GUI form values — resolved: the latter is **Draft Values**; the former remains "stored config".
