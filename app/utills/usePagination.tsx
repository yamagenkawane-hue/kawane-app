import { useState } from "react";
import { Post } from "../type";

type UsePaginationReturn = {
  paginatedPosts: Post[];
  totalPages: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
};

export const usePagination = (
  items: Post[],
  itemsPerPage: number
): UsePaginationReturn => {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(items.length / itemsPerPage);

  const paginatedItems = items.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return {
    paginatedPosts: paginatedItems,
    totalPages,
    currentPage,
    setCurrentPage,
  };
};
