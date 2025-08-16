import React from "react";
import { safeText } from "@/utils/dates";

export default function SafeText({ value }: { value: any }) {
  return <>{safeText(value)}</>;
}
