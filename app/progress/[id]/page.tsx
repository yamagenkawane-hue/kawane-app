"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import Link from "next/link";

import db from "@/lib/firebase";

import GanttChart from "../../components/GenttChart/GenttChart";

import { Post, ProcessMaster, ProcessItem } from "@/app/type";

export default function ProgressDetail() {
  const params = useParams();

  const id = Array.isArray(params?.id) ? params.id[0] : params?.id || "";

  const [post, setPost] = useState<Post | null>(null);

  const [processes, setProcesses] = useState<ProcessMaster[]>([]);

  // =========================
  // Firestore取得
  // =========================

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        // 投稿取得
        const postRef = doc(db, "posts", id);

        const postSnap = await getDoc(postRef);

        if (postSnap.exists()) {
          setPost({
            id: postSnap.id,
            ...(postSnap.data() as Omit<Post, "id">),
          });
        }

        // 工程マスタ取得
        const processRef = collection(db, "processMaster");

        const processSnap = await getDocs(processRef);

        const processData = processSnap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<ProcessMaster, "id">),
        }));

        // sort順
        processData.sort((a, b) => a.sort - b.sort);

        setProcesses(processData);
      } catch (error) {
        console.error(error);
      }
    };

    fetchData();
  }, [id]);

  // =========================
  // Loading
  // =========================

  if (!post || processes.length === 0) {
    return <div>Loading...</div>;
  }

  // =========================
  // 日付変換
  // =========================

  const safeDate = (date?: string) => {
    if (!date || date.trim() === "") {
      return new Date();
    }

    const parts = date.split("-");

    if (parts.length !== 3) {
      return new Date();
    }

    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  };

  // =========================
  // 日付加算
  // =========================

  const addDays = (baseDate: Date, days: number) => {
    const newDate = new Date(baseDate);

    newDate.setDate(newDate.getDate() + days);

    return newDate;
  };

  // =========================
  // ガントデータ生成
  // =========================

  const delivery = safeDate(post.deliveryDate);

  const ganttProcesses: ProcessItem[] = [];

  let currentDate = safeDate(post.manufacturingDate);

  processes.forEach((process) => {
    const startDate = currentDate;

    const endDate = addDays(startDate, process.days);

    // =========================
    // 進捗率
    // =========================

    let progress = 0;

    switch (process.id) {
      case "manufacturing":
        progress =
          post.orderAmount > 0
            ? Math.floor((post.manufacturingAmount / post.orderAmount) * 100)
            : 0;
        break;

      case "cleaning":
        progress =
          post.orderAmount > 0
            ? Math.floor((post.cleaningAmount / post.orderAmount) * 100)
            : 0;
        break;

      case "inspection":
        progress =
          post.orderAmount > 0
            ? Math.floor((post.inspectionAmount / post.orderAmount) * 100)
            : 0;
        break;

      case "measurement":
        progress =
          post.orderAmount > 0
            ? Math.floor((post.measurementAmount / post.orderAmount) * 100)
            : 0;
        break;

      case "packaging":
        progress =
          post.orderAmount > 0
            ? Math.floor((post.packagingAmount / post.orderAmount) * 100)
            : 0;
        break;
    }

    // =========================
    // ガント追加
    // =========================

    ganttProcesses.push({
      id: process.id,
      name: process.name,
      start: startDate,
      end: endDate,
      progress,
      isDelay: endDate > delivery,
    });

    // 次工程開始日
    currentDate = endDate;
  });

  return (
    <div style={{ padding: "24px" }}>
      {/* 戻る */}
      <div
        style={{
          marginBottom: "20px",
        }}
      >
        <Link
          href="/reservation"
          style={{
            display: "inline-block",
            padding: "10px 16px",
            backgroundColor: "#2563eb",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "bold",
          }}
        >
          ← 進捗管理へ戻る
        </Link>
      </div>

      {/* タイトル */}
      <h1>{post.productName}</h1>

      <p>得意先: {post.customerName}</p>

      <p>受注数量: {post.orderAmount}</p>

      <p>状態: {post.status}</p>

      <p>納期: {post.deliveryDate}</p>

      {/* ガント */}
      <div
        style={{
          marginTop: "40px",
        }}
      >
        <GanttChart
          processes={ganttProcesses}
          deliveryDate={post.deliveryDate}
        />
      </div>
    </div>
  );
}
