import { $ } from "./dom";

type Choice = "save" | "discard" | "cancel";
function ask(title: string, description: string, mode: "leave" | "delete"): Promise<Choice> {
  const dialog = $<HTMLDialogElement>("confirm-dialog");
  $("confirm-title").textContent = title;
  $("confirm-description").textContent = description;
  $("confirm-save").classList.toggle("hidden", mode !== "leave");
  $("confirm-discard").textContent = mode === "leave" ? "不保存并离开" : "删除绘画";
  dialog.returnValue = "cancel";
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(["save", "discard"].includes(dialog.returnValue) ? dialog.returnValue as Choice : "cancel"), { once: true });
    dialog.showModal();
    $("confirm-cancel").focus();
  });
}
export const confirmLeave = () => ask("还有未保存的修改", "保存后可从首页继续编辑。也可以放弃本次修改，返回上一次保存的版本。", "leave");
export const confirmDelete = async (title: string) => (await ask("删除这份绘画？", `“${title}”及其本地绘画数据将被删除，此操作不能撤销。`, "delete")) === "discard";
