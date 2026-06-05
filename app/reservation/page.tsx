"use client";

import Link from "next/link";
import styles from "./page.module.css";
import React, { useState } from "react";
import SearchForm from "../components/SearchForm/SearchForm";
import ReservationList from "../components/ReservationList/ReservationList";
import TableHeader from "../components/TableHeader/TableHeader";
import Pagination from "../components/Pagination/Pagination";
import DeleteIcon from "@mui/icons-material/Delete";
import { useFetchPosts } from "../utills/useFetchPosts";
import { usePagination } from "../utills/usePagination";
import { useReservationDelete } from "../utills/useReservationDelete";

const itemsPerPage = 7;

const Reservation = () => {
  const { posts, setShouldFetch } = useFetchPosts();
  const [statusFilter, setStatusFilter] = useState("全件");
  const [search, setSearch] = useState("");

  const filteredPosts = posts
    .filter((post) => {
      if (post.delete) {
        return false;
      }

      const keyword = search.toLowerCase();

      const isSearchMatch =
        !search ||
        String(post.orderNo || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.productName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.customerName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.status || "")
          .toLowerCase()
          .includes(keyword) ||
        String(post.deliveryDate || "")
          .toLowerCase()
          .includes(keyword);

      let isStatusMatch = true;

      if (statusFilter !== "全件") {
        if (statusFilter === "遅延") {
          if (!post.manufacturingDate) {
            isStatusMatch = false;
          } else {
            const start = new Date(post.manufacturingDate);
            const end = new Date(post.deliveryDate);
            const today = new Date();
            const total = end.getTime() - start.getTime();
            const passed = today.getTime() - start.getTime();
            const timeProgress = (passed / total) * 100;
            const workProgress =
              post.manufacturingAmount > 0
                ? (post.packagingAmount / post.manufacturingAmount) * 100
                : 0;

            isStatusMatch = workProgress < timeProgress;
          }
        } else {
          isStatusMatch = post.status === statusFilter;
        }
      }

      return isSearchMatch && isStatusMatch;
    })

    .sort((a, b) => {
      const customerCompare = a.customerName.localeCompare(
        b.customerName,
        "ja",
      );

      if (customerCompare !== 0) {
        return customerCompare;
      }

      return (
        new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime()
      );
    });

  console.table(
    filteredPosts.map((p) => ({
      customerName: JSON.stringify(p.customerName),
      orderNo: p.orderNo,
    })),
  );

  const { paginatedPosts, currentPage, setCurrentPage } = usePagination(
    filteredPosts,
    itemsPerPage,
  );

  const handleDelete = useReservationDelete(setShouldFetch);

  return (
    <>
      <div className={styles.reservationImg}>
        <Link href="/" className={styles.topPageLink}>
          <button className={styles.topPageButton}>トップページに戻る</button>
        </Link>

        <div className={styles.center}>
          <h1>進捗管理</h1>
        </div>

        <div className={styles.searchDelete}>
          <SearchForm search={search} setSearch={setSearch} />

          <div className={styles.filterArea}>
            <button
              onClick={() => setStatusFilter("全件")}
              className={
                statusFilter === "全件"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              全件
            </button>

            <button
              onClick={() => setStatusFilter("未着手")}
              className={
                statusFilter === "未着手"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              未着手
            </button>

            <button
              onClick={() => setStatusFilter("製造中")}
              className={
                statusFilter === "製造中"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              製造中
            </button>

            <button
              onClick={() => setStatusFilter("洗浄中")}
              className={
                statusFilter === "洗浄中"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              洗浄中
            </button>

            <button
              onClick={() => setStatusFilter("検査中")}
              className={
                statusFilter === "検査中"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              検査中
            </button>

            <button
              onClick={() => setStatusFilter("測量中")}
              className={
                statusFilter === "測量中"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              計量中
            </button>

            <button
              onClick={() => setStatusFilter("梱包中")}
              className={
                statusFilter === "梱包中"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              梱包中
            </button>

            <button
              onClick={() => setStatusFilter("出荷完了")}
              className={
                statusFilter === "出荷完了"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              出荷完了
            </button>

            <button
              onClick={() => setStatusFilter("遅延")}
              className={
                statusFilter === "遅延"
                  ? styles.activeFilter
                  : styles.filterButton
              }
            >
              遅延
            </button>
          </div>

          <Link className={styles.deleteIconLink} href="/childDelete">
            <DeleteIcon className={styles.deleteIcon} />
          </Link>
        </div>
      </div>

      <div className={styles.reservationWrapper}>
        <table border={1} className={styles.listTitle}>
          <TableHeader />

          <tbody>
            {paginatedPosts.map((post) => (
              <ReservationList
                key={post.id}
                post={post}
                handleDelete={() => handleDelete(post.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

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
