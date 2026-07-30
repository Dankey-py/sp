import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Study Planner · Kimi 国内版" },
    {
      name: "description",
      content: "使用 Kimi 国内版 AI 规划专注、高效的学习任务。",
    },
  ];
}

export default function Home() {
  return <Welcome />;
}
