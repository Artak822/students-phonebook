"use client";

import { useParams } from "next/navigation";
import StudentForm from "../StudentForm";

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <StudentForm empId={Number(id)} />;
}
