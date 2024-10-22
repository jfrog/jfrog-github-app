<template>
  <span v-show="!isLoading" class="title">{{ title }}</span>

  <div class="login-container">
    <div v-if="isLoading" class="spinner-container">
      <div class="progress-wrapper">
        <el-progress
            type="circle"
            class="loader"
            :color="() => '#3eb065'"
            :percentage="percentage"
        />
        <span class="loading-status">
          {{ status }}
          <span class="dot-container">
            <span class="dot-animate"></span>
          </span>
        </span>
      </div>
    </div>

    <span v-show="!isLoading && results.length">{{finishedText}}</span>

    <el-table border stripe v-if="results.length && !isLoading && !isPartialSuccess" :data="results" class="result-table">
      <el-table-column prop="repoName" label="Repository Name" />
      <el-table-column prop="prLink" label="Pull Request">
        <template #default="scope">
          <a :href="scope.row.prLink" target="_blank">{{pullRequestLinkText}}</a>
        </template>
      </el-table-column>
    </el-table>

    <el-table border stripe v-else-if="results.length && !isLoading && isPartialSuccess" :data="results" class="result-table">
      <el-table-column prop="repoName" label="Repository Name"/>
      <el-table-column label="Status">
        <template #default="scope">
          <span>{{ scope.row?.errorMessage ? 'Failed' : 'Success' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Reason Of Failure" >
        <template #default="scope">
          <span>{{ scope.row?.errorMessage || 'none' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="prLink" label="Pull Request">
        <template #default="scope">
          <a v-if="scope.row.prLink" :href="scope.row.prLink" target="_blank">{{pullRequestLinkText}}</a>
          <span v-else>No PR to approve</span>
        </template>
      </el-table-column>
    </el-table>

    <el-form v-else-if="!isLoading" label-position="top" :model="model" ref="form" :rules="rules" class="login-form">
      <div class="el-form-item-input-container">
        <el-alert
            v-if="errText"
            title="Error"
            type="error"
            :closable="false"
            effect="light"
            :description="errText"
            show-icon
        ></el-alert>
        <el-form-item label="Platform URL" prop="platformUrl" required>
          <el-input ref="platformUrl" name="platformUrl" v-model="model.platformUrl" class="login-form-input" />
        </el-form-item>
      </div>
      <div class="el-form-item-input-container">
        <el-form-item label="Access Token" prop="accessToken" required>
          <el-input
              ref="accessToken"
              name="accessToken"
              v-model="model.accessToken"
              show-password
              type="password"
              class="login-form-input"
          />
        </el-form-item>
      </div>

      <el-dropdown :hide-on-click="false" @click.native="toggleDropdown" @mouseenter="toggleDropdown(true)">
        <el-button class="demonstration">Advanced Settings</el-button>
        <template v-if="isToggled" #dropdown>
          <el-dropdown-menu @click.native.stop placement="left">
            <el-dropdown-item v-for="option in advancedConfig" :key="option.value" >
              <el-checkbox class="checkbox" v-model="option.checked">{{ option.label }}</el-checkbox>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button
          class="submit-button"
          :disabled="!model.accessToken || !model.platformUrl || isLoading"
          type="success"
          @click="submitForm"
      >
        Finish Setup
      </el-button>
    </el-form>

  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import axios from 'axios';
import { ElForm,  } from 'element-plus';

export default defineComponent({
  name: 'SetUp',
  data() {
    return {
      model: {
        platformUrl: '',
        accessToken: '',
      },
      rules: {
        platformUrl: [
          { required: true, message: 'Platform URL is required', trigger: 'blur' },
        ],
        accessToken: [
          { required: true, message: 'Access Token is required', trigger: 'blur' },
        ],
      },
      isLoading: false,
      title: 'WELCOME TO THE JFROG GITHUB APP!',
      responseMessage: '',
      percentage: 0,
      isToggled: false,
      pullRequestLinkText: 'PR to approve',
      isPartialSuccess: false,
      status: 'Loading',
      total: 0,
      advancedConfig: [
        { label: 'Scan pull request', value: "isPullRequestScan", checked: true },
        { label: 'Scan Repository', value: 'isScanRepository', checked: true},
        { label: 'Merge to Default Branch', value: 'mergeToDefaultBranch', checked: false },
      ],
      errText: '',
      finishedText: '',
      installCounter: 0,
      installationId: '',
      ws: null as WebSocket | null,
      results: [] as any[],
    };
  },
  mounted() {
    const params = new URLSearchParams(window.location.search);
    this.installationId = params.get('installation_id')!;
    this.initWebSocket();
  },
  methods: {
    initWebSocket() {
      this.ws = new WebSocket('ws://localhost:5000');

      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({clientId: this.installationId}));
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === "Installing Frogbot") {
          this.percentage += 25;
          this.total = data.total;
          this.installCounter = 0;
          this.status = "Installing Frogbot " + this.installCounter + "/" + this.total;
        } else if (data.status === "Frogbot installed") {
          this.installCounter++;

          this.percentage += Math.min((this.installCounter / this.total) * 25, 25);
          this.status = "Installing Frogbot " + this.installCounter + "/" + this.total;
          if (this.installCounter === this.total) {
            this.percentage = 100;
          }
        } else {
          this.status = data.status;
          this.percentage += 25;
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    },

    async submitForm() {
      const formRef = this.$refs.form as typeof ElForm;

      formRef.validate(async (valid: boolean) => {
        if (valid) {
          this.isLoading = true;
          this.responseMessage = '';
          this.errText = '';
          const advancedConfig =  this.advancedConfig.reduce((acc, option) => {
            acc[option.value] = option.checked;
            return acc;
          }, {}  as Record<string, boolean>);
          if(advancedConfig.mergeToDefaultBranch) {
            this.pullRequestLinkText = 'Merged pull request link'
            this.finishedText = "Frogbot has been installed on all of your repositories and is ready to scan";
          }
          else{
            this.finishedText = "Almost finished! Please approve the pull request at every repository to have Frogbot installed";
          }
          try {
            const response = await axios.post('http://localhost:3000/submitForm', {
              accessToken: this.model.accessToken,
              platformUrl: this.model.platformUrl,
              installationId: this.installationId,
              advancedConfig: advancedConfig
            });
            this.results = response.data;
            if (response.status === 206) {
              this.isPartialSuccess = true;
              this.responseMessage = 'Some of the installs failed';
            } else {
              this.isPartialSuccess = false;
              this.responseMessage = 'Setup completed successfully!';
            }
            this.title = this.responseMessage;
          } catch (error: any) {
            this.errText = error.response.data;
          } finally {
            this.isLoading = false;
            this.percentage = 0;
          }
        } else {
          this.responseMessage = 'Please fill out the required fields!';
        }
      });
    },
    toggleDropdown(show = false) {
      this.isToggled = show;
    }
  },
});
</script>

<style scoped>
.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.progress-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.loading-status {
  margin-top: 10px;
  font-size: 16px;
  text-align: center;
  display: inline-block;
}

.loader {
  color: #3eb065;
}

.progress-wrapper {
  margin: 0;
}

.login-form {
  width: 100%;
  max-width: 20vw;
  display: flex;
  flex-direction: column;
}

.el-form-item-input-container {
  width: 100%;
  margin-bottom: 15px;
}

.login-form-input {
  width: 100%;
  height: 40px;
}

.dot-container {
  width: 5px;
  display: inline-block;
}

@keyframes dots {
  0%,
  33% {
    content: ".";
  }
  66% {
    content: "..";
  }
  100% {
    content: "...";
  }
}

.dot-animate::after {
  content: ".";
  display: inline-block;
  animation: dots 2.5s steps(3, end) infinite;
}

.submit-button {
  width: 100%;
  height: 40px;
  margin-top: 20px;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

.result-table {
  width: 50%;
  margin-top: 20px;
}

.result-table a {
  color: #3eb065;
}

.result-table a:hover {
  color: #2c903d;
}

.title {
  font-weight: 500;
  text-transform: uppercase;
  font-size: 30px;
  color: #40be46;
  text-align: center;
  margin-bottom: 10vh;
}

.checkbox{
  font-family: Open Sans,Helvetica Neue,Helvetica,Arial,sans-serif;
}

.el-checkbox {
  --el-checkbox-icon-color: #3eb065 ;
  --el-checkbox-icon-color-checked: #3eb065;
  --el-checkbox-checked-bg-color: #3eb065;
  --el-menu-hover-text-color: #3eb065;
  --el-checkbox-input-border-color-hover: #3eb065;
  --el-checkbox-checked-text-color: #3eb065;
  --el-checkbox-checked-input-border-color: #3eb065;
}

.el-button:focus-visible{
  color: #3eb065;
  outline: 1px solid #3eb065;
}

.el-button:hover{
  color: #3eb065;
  outline: 1px solid #3eb065;
}

</style>
