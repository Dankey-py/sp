import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "StudyOS · IB Study Manager" },
    {
      name: "description",
      content: "Plan IB deadlines, track study sessions and get contextual help from Kimi.",
    },
  ];
}

export default function Home() {
  return <Welcome />;
}
