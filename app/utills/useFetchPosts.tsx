import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import db from "../../../lib/firebase";
import { Post } from "../type";

export const useFetchPosts = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [shouldFetch, setShouldFetch] = useState(true);
  useEffect(() => {
    if (shouldFetch) {
      const fetchData = async () => {
        const postData = collection(db, "posts");
        const q = query(postData, orderBy("firstDate", "asc"));
        const querySnapshot = await getDocs(q);
        const postsArray = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return { ...data, id: doc.id };
        });
        setPosts(postsArray as Post[]);
      };

      fetchData();
      setShouldFetch(false);
    }
  }, [shouldFetch]);

  return { posts, setShouldFetch };
};
