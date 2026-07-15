import type { Metadata } from "next";
import { BriefForm } from "./BriefForm";

export const metadata: Metadata = {
  title: "AI-квалификатор входящих лидов",
  description:
    "Бриф для оценки сценария, интеграций, экономики и требований к пилотному запуску голосового помощника.",
};

export default function Home() {
  return <BriefForm />;
}
