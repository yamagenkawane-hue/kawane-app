export type StatusType =
  | "未着手"
  | "製造中"
  | "製造完了"
  | "洗浄中"
  | "洗浄完了"
  | "検査中"
  | "検査完了"
  | "測量中"
  | "測量完了"
  | "梱包中"
  | "梱包完了"
  | "出荷OK";

export type DailyProgress = {
  date: string;

  amount: number;
};

export type ProductionLog = {
  date: string;

  amount: number;
};

export type Post = {
  id: string;

  orderNo: string;

  productCode: string;
  productName: string;

  customerName: string;

  orderAmount: number;

  manufacturingDate: string;
  manufacturingAmount: number;

  cleaningDate: string;
  cleaningAmount: number;

  inspectionDate: string;
  inspectionAmount: number;

  measurementDate: string;
  measurementAmount: number;

  packagingDate: string;
  packagingAmount: number;

  remainingAmount: number;

  deliveryDate: string;

  remark: string;

  status: StatusType;

  // 日別実績
  manufacturingLogs: ProductionLog[];

  cleaningLogs: ProductionLog[];

  inspectionLogs: ProductionLog[];

  measurementLogs: ProductionLog[];

  packagingLogs: ProductionLog[];

  delete?: boolean;

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
