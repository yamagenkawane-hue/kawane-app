export type StatusType =
  | "未着手"
  | "製造中"
  | "製造完了"
  | "洗浄中"
  | "洗浄完了"
  | "検査中"
  | "検査完了"
  | "計量中"
  | "計量完了"
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
  lotNo?: string;
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
  shippedAmount?: number;
  remainingAmount: number;
  deliveryDate: string;
  completionScheduledDate?: string;
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
  days: Day[];
};

// Day型（予約・実績の1日分データ）
export type Day = {
  date: string;
  name: string;
  startTime: string;
  endTime: string;
  realStartTime?: string;
  realEndTime?: string;
  remark?: string;
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
  productId?: string;
  customerId?: string;
  orderNo: string;
  lotNo?: string;
  productCode?: string;
  productName: string;
  customerName: string;
  orderAmount: number;
  remainingAmount: number;
  status: string;
  deliveryDate: string;
  completionScheduledDate?: string;
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
  delete?: boolean;
};

export type Product = {
  productName: string;
  customer: string;
  quantity: number;
};

export type ProcessItem = {
  id: string;
  name: string;
  actualStart: Date;
  actualEnd: Date | null;
  predictedEnd: Date;
  progress: number;
  isDelay: boolean;
  completedAmount: number;
  remainingAmount: number;
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
  outsourcing?: boolean;
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
  scheduleId?: string;
  orderProcessId?: string;
  processId: string;
  processName: string;
  date: string;
  amount: number;
  createdAt: string;
};

export type OrderProcess = {
  id: string;
  postId: string;
  productId?: string;
  customerId?: string;
  productProcessId?: string;
  orderNo: string;
  productCode: string;
  productName: string;
  customerName: string;
  processName: string;
  processOrder: number;
  plannedAmount: number;
  completedAmount: number;
  completedDate: string;
  subcontractorId: string | null;
  subcontractorName?: string;
  outsourceSentDate?: string;
  outsourceExpectedReturnDate?: string;
  outsourceReturnedDate?: string;
  outsourceStatus?: string;
  outsourceNote?: string;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductionSchedule = {
  id: string;
  postId?: string;
  orderNo?: string;
  customerName: string;
  productName: string;
  pressNumber: string;
  lotNo: string;
  planAmount: number;
  pressCompletedAmount: number;
  pressCompletedDate: string;
  shippingScheduledStart?: string;
  shippingScheduledEnd?: string;
  createdAt: string;
  updatedAt: string;
};

export type Lot = {
  id: string;
  lotNo: string;
  lotType: "normal" | "trial" | "advance";
  productName: string;
  customerName: string;
  quantity: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerMaster = {
  id: string;
  customerName: string;
  shippingOffsetDays: number;
  note: string;
};

export type ProductMaster = {
  id: string;
  customerId?: string;
  productCode: string;
  productName: string;
  customerName: string;
  standard: string;
  unit: string;
};

export type MaterialMaster = {
  id: string;
  materialCode: string;
  materialName: string;
  supplierName: string;
  unit: string;
};

export type InventoryItem = {
  id: string;
  productCode: string;
  productName: string;
  lotNo: string;
  currentStock: number;
  allocatedStock: number;
  updatedAt: string;
};

export type ShipmentRecord = {
  id: string;
  postId: string;
  productCode: string;
  productName: string;
  lotNo: string;
  customerName: string;
  scheduledDate: string;
  shippedDate: string;
  shippedAmount: number;
  carryoverAmount: number;
};

export type Shipment = {
  id: string;
  postId: string;
  orderNo: string;
  customerName: string;
  productCode?: string;
  productName: string;
  lotNo: string;
  scheduledDate: string;
  deliveryDate: string;
  orderAmount: number;
  quantity: number;
  createdAt: string;
  updatedAt: string;
};

export type InventoryAllocation = {
  id: string;
  postId: string;
  inventoryItemId: string | null;
  productCode: string;
  lotNo: string;
  allocatedAmount: number;
  shippedAmount: number;
  confirmedAt: string;
};

export type Subcontractor = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductProcess = {
  id: string;
  productId?: string;
  productCode: string;
  processName: string;
  processOrder: number;
  subcontractorId: string | null;
  subcontractorName?: string;
  outsourcing?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PostRow = {
  manufacturing_date?: string;
  created_at?: string;
  delivery_date?: string;
  completion_scheduled_date?: string;
};
