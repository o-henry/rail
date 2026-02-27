export type ListItem = {
  text: string;
  childLists: { ordered: boolean; items: ListItem[] }[];
};

export type TextBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "paragraph"; text: string }
  | { kind: "image"; alt: string; src: string; title?: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "rule" }
  | { kind: "code"; language: string; code: string };

export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
