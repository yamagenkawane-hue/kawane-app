import React from "react";
import SearchIcon from "@mui/icons-material/Search";
import styles from "./page.module.css";
import { SearchDateProps } from "@/app/type";

const SearchForm: React.FC<SearchDateProps> = ({ search, setSearch }) => {
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return (
    <div className={styles.searchform}>
      <div className={styles.searchIcon}>
        <SearchIcon />
      </div>
      <input
        className={styles.search}
        type="date"
        value={search || getTodayDate()}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
  );
};

export default SearchForm;
