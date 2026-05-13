export type Day = {
  date: string;
  name: string;
  id: string;
  class: string;
  startTime: string;
  endTime: string;
  realStartTime?: string;
  realEndTime?: string;
  remark?: string;
  delete: boolean;
  userId: string;
};

export type Post = {
  id: string;
  days: Day[];
  delete?: boolean;
};

export type User = {
  id: string;
  name: string;
  pass: string;
  manager: boolean;
  delete: boolean;
};

export type EditData = {
  date: string;
  startTime: string;
  endTime: string;
  remark: string;
};

export type UserTableRowsProps = {
  filteredPosts: Post[];
  editingRow: { postIndex: number; dayIndex: number } | null;
  editData: EditData;
  setEditData: (data: EditData) => void;
  handleEdit: (postIndex: number, dayIndex: number) => void;
  handleSave: () => void;
  handleDelete: (post: Post) => void;
  setEditingRow: (row: { postIndex: number; dayIndex: number } | null) => void;
};

export type SearchDateProps = {
  search: string;
  setSearch: (date: string) => void;
};

export type ReservationRowProps = {
  post: { id: string; days: Day[] };
  postIndex: number;
  editingRow: { postId: string; dayIndex: number } | null;
  editStartTime: string;
  editEndTime: string;
  setEditStartTime: (time: string) => void;
  setEditEndTime: (time: string) => void;
  handleEdit: (postId: string, dayIndex: number) => void;
  handleSave: () => Promise<void>;
  handleDelete: (postIndex: number) => Promise<void>;
  handleCancel: () => void;
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

export type ReservationInputProps = {
  day: string;
  index: number;
  onChange: (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export type ChildReservationRowProps = {
  postId: string;
  day: Day;
  dayIndex: number;
  editingRow: { postId: string; dayIndex: number } | null;
  editData: Day | null;
  handleChange: (field: keyof Day, value: string) => void;
  handleEdit: (day: Day, postId: string, dayIndex: number) => void;
  handleSave: () => void;
  handleCancel: () => void;
  handleDelete: (postIndex: number) => void;
  postIndex: number;
};