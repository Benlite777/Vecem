import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { getUserProfileByUsername } from "../services/userService";
import { useAuth } from "../contexts/AuthContext";
import NavbarPro from "../components/NavbarPro";
import { MessageSquarePlus } from "lucide-react";
import PromptCard from "../components/PromptCard";
import { getPromptDetails, logPromptClick } from "../services/promptService";
import { toast } from "react-hot-toast";
import { API_BASE_URL } from "../config";

interface Dataset {
  id: string;
  name: string;
  description: string;
  upload_type?: string;
  uploadedAt: string;
  updatedAt: string;
}

interface Prompt {
  id: string;
  name: string;
  description: string;
  domain: string;
  prompt: string;
  createdAt: string;
  updatedAt?: string;
}

interface UserProfileData {
  uid: string;
  username: string;
  name: string;
  profilePicture?: string;
  bio?: string;
  githubUrl?: string;
  datasets: Dataset[];
  prompts?: Prompt[];
}

const OtherProfile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("latest");
  const [userData, setUserData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const [activeView, setActiveView] = useState<"datasets" | "prompts">(
    "datasets"
  );
  const [selectedPrompt, setSelectedPrompt] = useState<any>(null);
  const [isPromptCardOpen, setIsPromptCardOpen] = useState(false);
  const promptsLoading = false; // Changed from useState to a constant since it's not being modified

  const formatDate = (dateString: string) => {
    if (!dateString) return "Date not available";

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }
      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Date not available";
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!username || !user) {
          throw new Error("Invalid username or user not authenticated");
        }

        // Get profile data directly
        const profileData = await getUserProfileByUsername(username);

        // SECURITY CHECK: If no profile data, show error
        if (!profileData) {
          throw new Error("Profile not found");
        }

        // SECURITY CHECK: Redirect to UserProfile if viewing own profile
        if (profileData.uid === user.uid) {
          navigate(`/${username}`);
          return;
        }

        setUserData(profileData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [username, user]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 },
  };

  const handleDatasetClick = async (_datasetId: string, datasetName: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/dataset-click`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: userData?.uid,
          datasetName: datasetName,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to log dataset click");
      }

      navigate(`/${username}/${datasetName}`);
    } catch (error) {
      console.error("Error logging dataset click:", error);
      navigate(`/${username}/${datasetName}`);
    }
  };

  const filteredAndSortedDatasets = useMemo(() => {
    if (!userData?.datasets) return [];

    let result = [...userData.datasets];

    if (searchQuery) {
      result = result.filter(
        (dataset) =>
          dataset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          dataset.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    switch (sortOption) {
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "latest":
      default:
        result.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        break;
    }

    return result;
  }, [userData?.datasets, searchQuery, sortOption]);

  const filteredAndSortedPrompts = useMemo(() => {
    if (!userData?.prompts || promptsLoading) return [];

    let result = [...userData.prompts];

    if (searchQuery) {
      result = result.filter(
        (prompt) =>
          prompt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          prompt.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    switch (sortOption) {
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "latest":
      default:
        result.sort(
          (a, b) =>
            new Date(b.updatedAt || 0).getTime() -
            new Date(a.updatedAt || 0).getTime()
        );
        break;
    }

    return result;
  }, [userData?.prompts, searchQuery, sortOption, promptsLoading]);

  const paginatedItems = useMemo(() => {
    const items =
      activeView === "datasets"
        ? filteredAndSortedDatasets
        : filteredAndSortedPrompts;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return items.slice(startIndex, endIndex);
  }, [
    filteredAndSortedDatasets,
    filteredAndSortedPrompts,
    currentPage,
    activeView,
  ]);

  const totalPages = Math.ceil(
    (activeView === "datasets"
      ? filteredAndSortedDatasets.length
      : filteredAndSortedPrompts.length) / itemsPerPage
  );

  const handlePromptClick = async (_promptId: string, promptName: string) => {
    try {
      try {
        await logPromptClick(userData?.uid || "", promptName);
      } catch (error) {
        console.warn("Failed to log prompt click:", error);
      }

      const loadingToast = toast.loading("Loading prompt details...");

      const promptData = await getPromptDetails(username || "", promptName);

      toast.dismiss(loadingToast);

      setSelectedPrompt({
        name: promptData.name,
        domain: promptData.domain,
        prompt: promptData.prompt,
        username: promptData.username,
        createdAt: promptData.createdAt,
        updatedAt: promptData.updatedAt,
      });
      setIsPromptCardOpen(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to load prompt details";
      console.error("Error fetching prompt details:", error);
      toast.error(errorMessage);
    }
  };

  const activeViewCount = useMemo(() => {
    if (!userData) return 0;
    return activeView === "datasets"
      ? userData.datasets.length
      : userData.prompts?.length || 0;
  }, [userData, activeView]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-cyan-400">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900">
        <NavbarPro />
        <div className="flex items-center justify-center h-screen">
          <div className="bg-gray-800/50 backdrop-blur-sm p-8 rounded-xl border border-red-500/20">
            <p className="text-red-400 text-lg">{error}</p>
            <button
              onClick={() => navigate("/home")}
              className="mt-4 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Profile not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <NavbarPro />
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-6 sm:py-8 pt-20 sm:pt-24">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row gap-4 px-2 sm:px-0"
        >
          <motion.div
            className="flex-shrink-0 flex justify-center mb-4 md:mb-0"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-cyan-300/20 rounded-full blur-md"></div>
              <img
                src={userData.profilePicture || "/default-avatar.png"}
                alt="Profile"
                className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full border-4 border-gray-800 shadow-[0_0_15px_rgba(0,255,255,0.1)] relative z-10 object-cover"
              />
            </div>
          </motion.div>

          <div className="flex-grow">
            <motion.div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 sm:p-4 md:p-6 shadow-md border border-gray-700 relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full filter blur-2xl transform translate-x-1/2 -translate-y-1/2 z-0"></div>

              <div className="relative z-10">
                <div className="flex flex-col sm:flex-row items-center sm:items-start sm:justify-between mb-3 sm:mb-4">
                  <div className="text-center sm:text-left space-y-1 mb-3 sm:mb-0">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-cyan-400 break-words">
                      {userData.name}
                    </h1>
                    <p className="text-sm sm:text-base text-gray-400 font-medium">
                      @{userData.username}
                    </p>
                  </div>
                </div>

                <p className="text-sm sm:text-base text-gray-300 mb-3 sm:mb-4 line-clamp-3 text-center sm:text-left">
                  {userData.bio || "No bio provided"}
                </p>

                <div className="flex justify-center sm:justify-start">
                  {userData.githubUrl && (
                    <motion.a
                      href={userData.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-cyan-300 text-sm"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                      View GitHub
                    </motion.a>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Content Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-4 sm:mt-8"
        >
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-2xl border border-gray-700">
            <div className="border-b border-gray-700/50 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-100">
                    {activeView.charAt(0).toUpperCase() + activeView.slice(1)}
                  </h2>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20"
                  >
                    <span className="text-cyan-400 font-medium">
                      {activeViewCount}
                    </span>
                  </motion.div>
                </div>
              </div>
            </div>

            {/* Dataset Filters and Search */}
            <div className="p-4 border-b border-gray-700/50">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                {/* View Selector */}
                <div className="flex gap-2 sm:gap-4 self-center sm:self-auto">
                  <button
                    onClick={() => setActiveView("datasets")}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all text-sm sm:text-base ${
                      activeView === "datasets"
                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        : "text-gray-400 hover:text-cyan-400 bg-gray-800/30"
                    }`}
                  >
                    Datasets
                  </button>
                  <button
                    onClick={() => setActiveView("prompts")}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all text-sm sm:text-base ${
                      activeView === "prompts"
                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                        : "text-gray-400 hover:text-cyan-400 bg-gray-800/30"
                    }`}
                  >
                    Prompts
                  </button>
                </div>

                {/* Center Search Bar */}
                <div className="w-full sm:max-w-md sm:mx-4 order-first sm:order-none mb-3 sm:mb-0">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Search ${activeView}...`}
                      className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-2 text-gray-200 focus:outline-none focus:border-cyan-500 text-sm sm:text-base"
                    />
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </div>

                {/* Right Side Filters */}
                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value)}
                    className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 text-gray-200 focus:outline-none focus:border-cyan-500 text-sm sm:text-base"
                  >
                    <option value="latest">Sort: Latest</option>
                    <option value="name">Sort: Name</option>
                  </select>
                  {searchQuery && (
                    <div className="text-gray-400 text-xs sm:text-sm px-2 py-1 bg-gray-800/30 rounded-lg">
                      {activeView === "datasets"
                        ? filteredAndSortedDatasets.length
                        : filteredAndSortedPrompts.length}{" "}
                      results
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Grid View */}
            <motion.ul
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6"
            >
              {activeView === "datasets" ? (
                paginatedItems.length > 0 ? (
                  paginatedItems.map((item) => {
                    const dataset = item as Dataset;
                    return (
                      <motion.li
                        key={dataset.id}
                        variants={itemVariants}
                        whileHover={{ scale: 1.02 }}
                        onClick={() =>
                          handleDatasetClick(dataset.id, dataset.name)
                        }
                        className="group relative bg-gray-800/40 hover:bg-gray-800/70 rounded-lg p-4 sm:p-5 border border-gray-700/50 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md"
                      >
                        <h3 className="text-base sm:text-lg font-semibold text-cyan-400 group-hover:text-cyan-300 transition-colors duration-300 mb-2 sm:mb-3 line-clamp-2">
                          {dataset.name}
                        </h3>
                        <p className="text-gray-300 text-sm sm:text-base mb-3 sm:mb-4 line-clamp-2">
                          {dataset.description || "No description provided"}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-gray-400">
                          <span className="flex items-center bg-gray-800/50 px-2 py-1 rounded-full">
                            <svg
                              className="w-3 h-3 sm:w-4 sm:h-4 mr-1"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                              <path
                                fillRule="evenodd"
                                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {dataset.upload_type || "Unknown Type"}
                          </span>
                          <span className="flex items-center bg-gray-800/50 px-2 py-1 rounded-full">
                            <svg
                              className="w-3 h-3 sm:w-4 sm:h-4 mr-1"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {formatDate(dataset.updatedAt || dataset.uploadedAt)}
                          </span>
                        </div>
                      </motion.li>
                    );
                  })
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="col-span-2 flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="w-24 h-24 mb-6 text-gray-600">
                      <svg
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-400 mb-2">
                      No datasets yet
                    </h3>
                    <p className="text-gray-500">
                      This user hasn't uploaded any datasets
                    </p>
                  </motion.div>
                )
              ) : promptsLoading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-2 flex flex-col items-center justify-center p-12 text-center"
                >
                  <div className="w-24 h-24 mb-6 text-cyan-400">
                    <svg className="animate-spin" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-400">Loading prompts...</p>
                </motion.div>
              ) : !userData?.prompts?.length ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-2 flex flex-col items-center justify-center p-12 text-center"
                >
                  <div className="w-24 h-24 mb-6 text-gray-600">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-400 mb-2">
                    No prompts yet
                  </h3>
                  <p className="text-gray-500">
                    This user hasn't shared any prompts
                  </p>
                </motion.div>
              ) : (
                paginatedItems.map((item) => {
                  const prompt = item as Prompt;
                  return (
                    <motion.li
                      key={prompt.id}
                      variants={itemVariants}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => handlePromptClick(prompt.id, prompt.name)}
                      className="group relative bg-gray-750/50 rounded-lg p-5 border border-gray-700/50 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer"
                    >
                      <h3 className="text-lg font-semibold text-cyan-400 group-hover:text-cyan-300 transition-colors duration-300 mb-3">
                        {prompt.name}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-400">
                        <span className="flex items-center">
                          <MessageSquarePlus className="w-4 h-4 mr-1" />
                          {prompt.domain || "General"}
                        </span>
                        <span className="flex items-center">
                          <svg
                            className="w-4 h-4 mr-1"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {formatDate(prompt.updatedAt || prompt.createdAt)}
                        </span>
                      </div>
                    </motion.li>
                  );
                })
              )}
            </motion.ul>

            {/* Show pagination only if there are items */}
            {(activeView === "datasets"
              ? filteredAndSortedDatasets.length
              : filteredAndSortedPrompts.length) > 0 && (
              <div className="border-t border-gray-700/50 p-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    className={`text-gray-400 hover:text-cyan-400 flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg hover:bg-gray-800/50 ${
                      currentPage === 1 ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    disabled={currentPage === 1}
                  >
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    <span className="text-sm sm:text-base">Prev</span>
                  </button>

                  <div className="flex items-center">
                    <div className="hidden sm:flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(totalPages, 5) },
                        (_, index) => {
                          // Show first page, last page, current page, and pages around current
                          let pageNum = index + 1;
                          if (totalPages > 5) {
                            if (currentPage <= 3) {
                              // Near beginning: show first 5 pages
                              pageNum = index + 1;
                            } else if (currentPage >= totalPages - 2) {
                              // Near end: show last 5 pages
                              pageNum = totalPages - 4 + index;
                            } else {
                              // Middle: show current page and 2 pages on each side
                              pageNum = currentPage - 2 + index;
                            }
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm ${
                                currentPage === pageNum
                                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                  : "hover:bg-gray-700 text-gray-400"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        }
                      )}
                    </div>

                    {/* Mobile pagination indicator */}
                    <div className="sm:hidden text-sm text-gray-400 bg-gray-800/50 px-3 py-1 rounded-lg">
                      Page {currentPage} of {totalPages}
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    className={`text-gray-400 hover:text-cyan-400 flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg hover:bg-gray-800/50 ${
                      currentPage === totalPages
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    disabled={currentPage === totalPages}
                  >
                    <span className="text-sm sm:text-base">Next</span>
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <PromptCard
        prompt={selectedPrompt}
        isOpen={isPromptCardOpen}
        onClose={() => setIsPromptCardOpen(false)}
      />
    </div>
  );
};

export default OtherProfile;
