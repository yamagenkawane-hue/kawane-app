export type StatusType =
  | "未着手"
  | "製造中"
  | "洗浄中"
  | "検査中"
  | "測量中"
  | "梱包中"
  | "出荷完了";

export type Post = {
  id: string;

  // 注番
  orderNo: string;

  // 製品情報
  productCode: string;

  productName: string;

  // 客先
  customerName: string;

  // =========================
  // 受注
  // =========================

  // 受注数量
  orderAmount: number;

  // 注残
  remainingAmount: number;

  // =========================
  // 製造
  // =========================
  manufacturingDate: string;

  manufacturingAmount: number;

  // =========================
  // 洗浄
  // =========================
  cleaningDate: string;

  cleaningAmount: number;

  // =========================
  // 検査
  // =========================
  inspectionDate: string;

  inspectionAmount: number;

  // =========================
  // 測量
  // =========================
  measurementDate: string;

  measurementAmount: number;

  // =========================
  // 梱包
  // =========================
  packagingDate: string;

  packagingAmount: number;

  // 納期
  deliveryDate: string;

  // 備考
  remark: string;

  // 状態
  status: StatusType;

  // 論理削除
  delete?: boolean;

  // 作成情報
  createdBy: string;

  updatedBy: string;

  createdAt: string;

  updatedAt: string;
};

export type User = {
  id: string;

  name: string;

  pass: string;

  manager: boolean;

  delete: boolean;
};

export type SearchProps = {
  search: string;

  setSearch: (value: string) => void;
};

export type ReservationRowProps = {
  post: Post;

  handleDelete: () => Promise<void>;
};

export type PaginationProps = {
  totalItems: number;

  itemsPerPage: number;

  currentPage: number;

  onPageChange: (page: number) => void;
};

export type UserRowProps = {
  user: User;

  editingUserId: string | null;

  editedUser: {
    name: string;

    pass: string;

    manager: boolean;

    delete: boolean;
  };

  isProtectedUser: boolean;

  onEdit: (user: User) => void;

  onSave: (userId: string) => void;

  onCancel: () => void;

  onDelete: (userId: string) => void;

  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

  onCheckboxChange: () => void;
};

export type LoginFormProps = {
  posts: User[];

  onLoginSuccess: (isManager: boolean) => void;
};
