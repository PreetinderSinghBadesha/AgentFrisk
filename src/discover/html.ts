import { Parser } from "htmlparser2";
import type { FormField } from "./form.js";

export interface HtmlForm {
  line: number;
  attributes: Record<string, string>;
  fields: FormField[];
}

export interface InlineScript {
  code: string;
  offset: number;
}

const SCRIPT_TYPES = new Set(["", "module", "text/javascript", "application/javascript", "text/babel"]);

export function parseHtml(text: string): { forms: HtmlForm[]; scripts: InlineScript[] } {
  const forms: HtmlForm[] = [];
  const scripts: InlineScript[] = [];
  let form: HtmlForm | null = null;
  let select: FormField | null = null;
  let option: { value: string | null; text: string } | null = null;
  let script: InlineScript | null = null;
  const lineAt = (index: number) => text.slice(0, index).split("\n").length;

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === "script" && !attrs.src && SCRIPT_TYPES.has((attrs.type ?? "").toLowerCase())) {
          script = { code: "", offset: -1 };
          return;
        }
        if (name === "form" && "toolname" in attrs) {
          form = { line: lineAt(parser.startIndex), attributes: attrs, fields: [] };
          return;
        }
        if (!form) return;
        if (name === "input" || name === "select" || name === "textarea") {
          const field: FormField = {
            tag: name,
            name: attrs.name ?? null,
            type: attrs.type ?? null,
            maxLength: attrs.maxlength ?? null,
            pattern: attrs.pattern ?? null,
            required: "required" in attrs,
            description: attrs.toolparamdescription ?? null,
            value: attrs.value ?? null,
            options: name === "select" ? [] : null,
          };
          form.fields.push(field);
          if (name === "select") select = field;
        } else if (name === "option" && select) {
          option = { value: attrs.value ?? null, text: "" };
        }
      },
      ontext(chunk) {
        if (script) {
          if (script.offset < 0) script.offset = parser.startIndex;
          script.code += chunk;
        } else if (option) option.text += chunk;
      },
      onclosetag(name) {
        if (name === "script" && script) {
          if (script.offset >= 0 && script.code.trim()) scripts.push(script);
          script = null;
        } else if (name === "option" && option && select) {
          select.options?.push(option.value ?? option.text.trim());
          option = null;
        } else if (name === "select") {
          select = null;
        } else if (name === "form" && form) {
          forms.push(form);
          form = null;
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(text);
  parser.end();
  return { forms, scripts };
}

export function padScript(text: string, script: InlineScript): string {
  const before = text.slice(0, script.offset);
  const lines = before.split("\n");
  const column = lines[lines.length - 1].length;
  return "\n".repeat(lines.length - 1) + " ".repeat(column) + script.code;
}
