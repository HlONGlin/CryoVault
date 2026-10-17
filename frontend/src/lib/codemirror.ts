import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";

import { languageFor } from "./format";

export function extensionsFor(name: string) {
  switch (languageFor(name)) {
    case "json":
      return [json()];
    case "yaml":
      return [yaml()];
    case "markdown":
      return [markdown()];
    case "python":
      return [python()];
    case "javascript":
      return [javascript({ jsx: true, typescript: true })];
    default:
      return [];
  }
}
