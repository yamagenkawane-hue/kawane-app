"use client";

import Link from "next/link";
import styles from "./page.module.css";
import React, { useState } from "react";
import Pagination from "../components/Pagination/Pagination";
import { useFetchPosts } from "../utills/useFetchPosts";
import { useTodayDate } from "../utills/useTodayDate";
import { usePagination } from "../utills/usePagination";
import ConfirmationTable from "../components/ConfirmationTable/ConfirmationTable";
import ManagerSearchForm from "../components/ManagerSearchForm/ManagerSearchForm";
// import ManagerReservationList from "../components/ManagerReservationList/ManagerReservationList";
import supabase from "../../lib/supabase";

const itemsPerPage = 15;

const Confirmation = () => {
  const { posts, setShouldFetch } = useFetchPosts();
  const [search, setSearch] = useTodayDate();
  const { paginatedPosts, currentPage, setCurrentPage } = usePagination(
    posts
      .map((post) =>
        search
          ? {
              ...post,
              days: post.days.filter((day) => day.date.startsWith(search)),
            }
          : post,
      )
      .filter((post) => post && !post.delete && post.days.length > 0)
      .sort(
        (a, b) =>
          new Date(a.days[0]?.date).getTime() -
            new Date(b.days[0]?.date).getTime() ||
          a.days[0]?.name.localeCompare(b.days[0]?.name),
      ),
    itemsPerPage,
  );

  const filteredPosts = posts
    .map((post) =>
      search
        ? {
            ...post,
            days: post.days.filter((day) => day.date.startsWith(search)),
          }
        : post,
    )
    .filter((post) => post && !post.delete && post.days.length > 0)
    .sort(
      (a, b) =>
        new Date(a.days[0]?.date).getTime() -
          new Date(b.days[0]?.date).getTime() ||
        a.days[0]?.name.localeCompare(b.days[0]?.name),
    );

  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);

  const handleBulkDelete = async () => {
    if (window.confirm("選択した注番の誤登録を取り消します。実績などがある注番は取消できません。在庫は減算されません。よろしいですか？")) {
      const deleteTargets = selectedIndexes.map(
        (index) => filteredPosts[index],
      );

      const ids = deleteTargets.map((post) => post.id);

      for (const id of ids) {
        const { error } = await supabase.rpc("soft_delete_order_post", { p_post_id: id });
        if (error) {
          alert(`取消処理を中断しました。先に処理した注番の取消は完了しています。${error.message}`);
          setSelectedIndexes([]);
          setShouldFetch(true);
          return;
        }
      }

      setSelectedIndexes([]);
      setShouldFetch(true);
    }
  };

  const isAllSelected = paginatedPosts.every((_, i) =>
    selectedIndexes.includes((currentPage - 1) * itemsPerPage + i),
  );

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedIndexes((prev) =>
        prev.filter(
          (i) =>
            !paginatedPosts
              .map((_, idx) => (currentPage - 1) * itemsPerPage + idx)
              .includes(i),
        ),
      );
    } else {
      const newIndexes = paginatedPosts.map(
        (_, idx) => (currentPage - 1) * itemsPerPage + idx,
      );
      setSelectedIndexes((prev) =>
        Array.from(new Set([...prev, ...newIndexes])),
      );
    }
  };

  return (
    <>
      <div className={styles.reservationImg}>
        <Link href="/" className={styles.topPageLink}>
          <button className={styles.topPageButton}>トップページに戻る</button>
        </Link>
        <div className={styles.center}>
          <h1>月別予約一覧</h1>
        </div>
        <div className={styles.searchDelete}>
          <ManagerSearchForm search={search} setSearch={setSearch} />
        </div>
      </div>
      <table border={1} className={styles.listTitle}>
        <ConfirmationTable
          handleBulkDelete={handleBulkDelete}
          handleToggleAll={handleToggleAll}
          isAllSelected={isAllSelected}
        />
        {/* <tbody>
          {paginatedPosts.map((post, index) => (
            <ManagerReservationList
              key={index}
              post={post}
              postIndex={(currentPage - 1) * itemsPerPage + index}
              isSelected={selectedIndexes.includes(
                (currentPage - 1) * itemsPerPage + index,
              )}
              toggleSelect={toggleSelect}
            />
          ))}
        </tbody> */}
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

export default Confirmation;
