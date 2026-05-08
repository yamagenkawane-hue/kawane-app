"use client";

import Link from "next/link";
import styles from "./page.module.css";
import React from "react";
import SearchForm from "../components/SearchForm/SearchForm";
import ReservationList from "../components/ReservationList/ReservationList";
import TableHeader from "../components/TableHeader/TableHeader";
import Pagination from "../components/Pagination/Pagination";
import DeleteIcon from "@mui/icons-material/Delete";
import { useFetchPosts } from "../utills/useFetchPosts";
import { useTodayDate } from "../utills/useTodayDate";
import { useReservationEdit } from "../utills/useReservationEdit";
import { usePagination } from "../utills/usePagination";
import { useReservationDelete } from "../utills/useReservationDelete";

const itemsPerPage = 7;

const Reservation = () => {
  const { posts, setShouldFetch } = useFetchPosts();
  const [search, setSearch] = useTodayDate();
  const {
    editStartTime,
    editEndTime,
    editingRow,
    setEditStartTime,
    setEditEndTime,
    handleEdit,
    handleSave,
    handleCancel,
  } = useReservationEdit(posts, setShouldFetch);

  const filteredPosts = posts
    .map((post) =>
      search
        ? { ...post, days: post.days.filter((day) => day.date === search) }
        : post
    )
    .filter((post) => post && !post.delete && post.days.length > 0)
    .sort(
      (a, b) =>
        new Date(a.days[0]?.date).getTime() -
          new Date(b.days[0]?.date).getTime() ||
        a.days[0]?.name.localeCompare(b.days[0]?.name)
    );

  const { paginatedPosts, currentPage, setCurrentPage } =
    usePagination(filteredPosts, itemsPerPage);
  const handleDelete = useReservationDelete(setShouldFetch);

  return (
    <>
      <div className={styles.reservationImg}>
        <Link href="/" className={styles.topPageLink}>
          <button className={styles.topPageButton}>トップページに戻る</button>
        </Link>
        <div className={styles.center}>
          <h1>予約一覧</h1>
        </div>
        <div className={styles.searchDelete}>
          <SearchForm search={search} setSearch={setSearch} />
          <Link className={styles.deleteIconLink} href="childDelete/">
            <DeleteIcon className={styles.deleteIcon} />
          </Link>
        </div>
      </div>
      <table border={1} className={styles.listTitle}>
        <TableHeader />
        <tbody>
          {paginatedPosts.map((post, index) => (
            <ReservationList
              key={index}
              post={post}
              postIndex={(currentPage - 1) * itemsPerPage + index}
              editingRow={editingRow}
              editStartTime={editStartTime}
              editEndTime={editEndTime}
              setEditStartTime={setEditStartTime}
              setEditEndTime={setEditEndTime}
              handleEdit={handleEdit}
              handleSave={handleSave}
              handleDelete={() =>
                handleDelete(
                  (currentPage - 1) * itemsPerPage + index,
                  filteredPosts
                )
              }
              handleCancel={handleCancel}
            />
          ))}
        </tbody>
      </table>
      <div className={styles.reservationPagination}>
        <Pagination
          totalItems={filteredPosts.length}
          itemsPerPage={itemsPerPage}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </>
  );
};

export default Reservation;
