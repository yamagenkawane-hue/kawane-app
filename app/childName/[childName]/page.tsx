"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import TableHeader from "@/app/components/TableHeader/TableHeader";
import ChildReservationRow from "@/app/components/ChildReservation/Childreservation";
import Pagination from "@/app/components/Pagination/Pagination";
import { useChildFetchPosts } from "@/app/utills/useChildFetchPosts";
import { useChildSave } from "@/app/utills/useChildSave";
import { useDelete } from "@/app/utills/useDelete";
import { Day, Post } from "@/app/type";

const itemsPerPage = 5;

const ChildReservationPage = () => {
  const params = useParams();
  const childName = Array.isArray(params?.childName)
    ? params.childName[0]
    : params?.childName;
  const decodedChildName = decodeURIComponent(childName || "");
  const [editData, setEditData] = useState<Day | null>(null);
  const [editingRow, setEditingRow] = useState<{
    postId: string;
    dayIndex: number;
  } | null>(null);
  const [shouldFetch, setShouldFetch] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const { posts } = useChildFetchPosts(shouldFetch, setShouldFetch);
  const { handleSave } = useChildSave({
    editData,
    editingRow,
    setEditingRow,
    setShouldFetch,
  });
  const { handleDelete } = useDelete(setShouldFetch);

  const filteredPosts = posts
    .filter((post) => !post.delete)
    .map((post) => {
      const days = post.days.filter((day) => day.name === decodedChildName);
      return days.length > 0 ? { ...post, days } : null;
    })
    .filter(Boolean) as Post[];

  const totalPages = Math.ceil(filteredPosts.length / itemsPerPage);

  const handleEdit = (day: Day, postId: string, dayIndex: number): void => {
    setEditData(day);
    setEditingRow({ postId, dayIndex });
  };

  const handleChange = (field: keyof Day, value: string) =>
    editData && setEditData({ ...editData, [field]: value });

  return (
    <div className={styles.childImg}>
      <Link href="/reservation" className={styles.childLink}>
        <button className={styles.childButton}>一覧に戻る</button>
      </Link>
      <div className={styles.childCenter}>
        <h1>
          {decodedChildName ? `${decodedChildName}さんの予約一覧` : "予約一覧"}
        </h1>
      </div>
      <table border={1} className={styles.childListTitle}>
        <TableHeader />
        <tbody>
          {filteredPosts
            .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
            .map((post, postIndex) => (
              <React.Fragment key={post.id}>
                {post.days.map((day, dayIndex) => (
                  <ChildReservationRow
                    key={dayIndex}
                    postId={post.id}
                    day={day}
                    dayIndex={dayIndex}
                    editingRow={editingRow}
                    editData={editData}
                    handleChange={handleChange}
                    handleEdit={handleEdit}
                    handleSave={handleSave}
                    handleCancel={() => setEditingRow(null)}
                    handleDelete={() => handleDelete(post)}
                    postIndex={postIndex}
                  />
                ))}
              </React.Fragment>
            ))}
        </tbody>
      </table>
      <div className={styles.childPagination}>
        <Pagination
          totalItems={filteredPosts.length}
          itemsPerPage={itemsPerPage}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
};

export default ChildReservationPage;
