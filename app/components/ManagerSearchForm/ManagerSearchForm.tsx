import React from "react";
import SearchIcon from "@mui/icons-material/Search";
import styles from "../ManagerSearchForm/page.module.css";

type SearchDateProps = {
  search: string;
  setSearch: (date: string) => void;
};

const ManagerSearchForm: React.FC<SearchDateProps> = ({ search, setSearch }) => {
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  };

  return (
    <div className={styles.searchform}>
      <div className={styles.searchIcon}>
        <SearchIcon />
      </div>
      <input
        className={styles.search}
        type="month"
        value={search || getTodayDate()}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
  );
};

export default ManagerSearchForm;
