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

export type ProcessLog = {
  date: string;
  amount: number;
};

export type PostData = {
  id: string;
  orderNo: string;
  productName: string;
  customerName: string;
  orderAmount: number;
  remainingAmount: number;
  status: string;
  deliveryDate: string;
  remark?: string;
  manufacturingAmount?: number;
  cleaningAmount?: number;
  inspectionAmount?: number;
  measurementAmount?: number;
  packagingAmount?: number;
  manufacturingLogs?: ProcessLog[];
  cleaningLogs?: ProcessLog[];
  inspectionLogs?: ProcessLog[];
  measurementLogs?: ProcessLog[];
  packagingLogs?: ProcessLog[];
};

export type Product = {
  productName: string;
  customer: string;
  quantity: number;
};

export type ProcessItem = {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  isDelay: boolean;
};

export type Props = {
  processes: ProcessItem[];
  deliveryDate: string;
};

export type CompanyCalendar = {
  id: string;
  date: string;
  name: string;
  isHoliday: boolean;
  type: string;
};

export type ProcessMaster = {
  id: string;
  processId: string;
  name: string;
  days: number;
  sort: number;
  enabled: boolean;
};

export type LineMaster = {
  id: string;
  lineName: string;
  processId: string;
  dailyCapacity: number;
  operationRate: number;
  enabled: boolean;
};

export type CapacitySetting = {
  id: string;
  processId: string;
  warningThreshold: number;
  dangerThreshold: number;
};

export type OperationRate = {
  id: string;
  processId: string;
  rate: number;
  enabled: boolean;
};

export type AISettings = {
  id: string;
  enabled: boolean;
  delayPrediction: boolean;
  autoSchedule: boolean;
  bottleneckPrediction: boolean;
};

export type ProcessResult = {
  id: string;
  postId: string;
  processId: string;
  processName: string;
  date: string;
  amount: number;
  createdAt: string;
};
