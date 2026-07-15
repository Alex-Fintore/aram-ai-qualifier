import type { Metadata } from "next";
import { BriefForm } from "./BriefForm";

export const metadata: Metadata = {
  title: "Короткий бриф — AI-квалификатор",
  description:
    "Короткий бриф для первичной оценки сценария AI-квалификатора и пилотного запуска.",
};

export default function Home() {
  return <BriefForm />;
}
