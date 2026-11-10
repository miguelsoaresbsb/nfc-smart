import { redirect } from "next/navigation";

export default function QrCodesRedirect() {
  redirect("/dashboard/nfc#qr-codes");
}
