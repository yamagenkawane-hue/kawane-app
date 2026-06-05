"use client";

import React from "react";
import styles from "./page.module.css";
import { SearchProps } from "@/app/type";

const SearchForm: React.FC<SearchProps> = ({ search, setSearch }) => {
  return (
    <div className={styles.searchArea}>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="
          注番・製品名・得意先・状態で検索
        "
        className={styles.searchInput}
      />
    </div>
  );
};

export default SearchForm;
