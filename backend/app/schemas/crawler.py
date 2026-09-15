from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class AuthConfig(BaseModel):
    login_url: str = Field(..., description="Target login page URL")
    username: str = Field(..., description="Username or email for authentication")
    password: str = Field(..., description="Password for authentication")
    username_selector: Optional[str] = Field(None, description="Optional custom CSS/XPath selector for username input")
    password_selector: Optional[str] = Field(None, description="Optional custom CSS/XPath selector for password input")
    submit_selector: Optional[str] = Field(None, description="Optional custom CSS/XPath selector for login submit button")

class CrawlRequest(BaseModel):
    project_id: str = Field(..., description="ID of the TestFlow project")
    base_url: str = Field(..., description="Starting URL to crawl")
    max_depth: int = Field(2, ge=1, le=5, description="Maximum link crawl depth")
    max_pages: int = Field(10, ge=1, le=50, description="Maximum number of pages to discover and test")
    auth: Optional[AuthConfig] = Field(None, description="Optional credentials for Approach A authentication")

class FormInputInfo(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = "text"
    placeholder: Optional[str] = None
    required: bool = False

class FormInfo(BaseModel):
    action: Optional[str] = None
    method: str = "GET"
    inputs: List[FormInputInfo] = []
    has_submit: bool = False

class DiscoveredPage(BaseModel):
    url: str
    title: str
    status_code: int = 200
    forms: List[FormInfo] = []
    buttons: List[str] = []
    links: List[str] = []
    depth: int = 0
    error: Optional[str] = None

class GeneratedCase(BaseModel):
    id: Optional[str] = None
    name: str
    code: str
    description: str
    test_type: str = "Automated"
    test_file: Optional[str] = None

class GeneratedSuite(BaseModel):
    id: Optional[str] = None
    name: str
    cases: List[GeneratedCase] = []

class CrawlJobStatus(BaseModel):
    job_id: str
    project_id: str
    status: str = "queued"  # queued, authenticating, crawling, generating, completed, failed
    progress: int = 0  # percentage 0 - 100
    message: str = "Job initialized"
    pages_discovered: int = 0
    pages_crawled: List[str] = []
    generated_suites: List[GeneratedSuite] = []
    error: Optional[str] = None
