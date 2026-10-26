export function $<T extends Element = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`找不到元素: ${id}`);
  return element as unknown as T;
}
